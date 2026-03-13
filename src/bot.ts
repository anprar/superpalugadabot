import path from "node:path";
import { I18n } from "@grammyjs/i18n";
import { limit } from "@grammyjs/ratelimiter";
import { Bot, session } from "grammy";
import { MAILTICKING_URL, MAX_MAILBOX_HISTORY_ITEMS, getBotToken, getSupportedLocale } from "./config.js";
import { ensureHistoryRetentionForWrite, getUserAccount, isAdminAccount, setUserPlan } from "./accounts.js";
import { buildHistoryKeyboard, buildImportKeyboard, buildLanguageKeyboard, buildMainMenuKeyboard, buildProcessingKeyboard, buildSubscriptionKeyboard } from "./keyboards.js";
import {
  buildAccountStatusMessage,
  buildAdminOnlyMessage,
  buildAdminPlanUpdatedMessage,
  buildAdminSetPlanUsageMessage,
  buildResetSessionDoneMessage,
  buildDeleteCurrentHistoryMessage,
  buildDeleteHistoryDoneMessage,
  buildDeleteHistoryMissingMessage,
  buildHistoryMessage,
  buildInboxMessage,
  buildImportInvalidFormatMessage,
  buildImportPromptMessage,
  buildImportQueuedMessage,
  buildNoteDeleteMissingMessage,
  buildNoteDeletedMessage,
  buildNoteInvalidMessage,
  buildNotePromptMessage,
  buildNoteSavedMessage,
  buildPlanExpiredMessage,
  buildRestoreMissingMessage,
  buildRestoreQueuedMessage,
  buildSubscriptionMessage,
  buildWelcomeMessage
} from "./messages.js";
import { enqueueMailJob } from "./queue.js";
import { clearBrowserState, createInitialSessionData, createSessionStorage, findMailboxInHistory, getRedisClient, mergeMailboxHistory, patchChatSession, syncChatSessionWithAccount } from "./sessions.js";
import type { BotContext, MailJobType, MailboxSession, SupportedLocale, UserAccount } from "./types.js";
import { buildAdultBirthDate, buildKoreanProfile, buildReadablePassword, buildRecommendedName, extractDomain, generateVirtualCards, isValidEmailAddress, normalizeEmailAddress } from "./utils.js";

type GlobalBotCache = typeof globalThis & { __mailTickingBot?: Bot<BotContext> };

const MAX_MAILBOX_NOTE_LENGTH = 500;

function getLocaleFromContext(ctx: BotContext): SupportedLocale {
  return getSupportedLocale(ctx.session.__language_code ?? ctx.from?.language_code);
}

function queueAcceptedCopy(locale: SupportedLocale, type: MailJobType): string {
  const copy = {
    id: {
      generate: "Sedang menyiapkan data baru. Tunggu sebentar...",
      refresh: "Sedang memperbarui inbox aktif. Tunggu sebentar..."
    },
    en: {
      generate: "Preparing fresh data now. Please wait...",
      refresh: "Updating the active inbox now. Please wait..."
    }
  } as const;

  return copy[locale][type];
}

function queueRejectedCopy(locale: SupportedLocale, reason: string): string {
  return locale === "id"
    ? `Job belum bisa dijalankan: ${reason}`
    : `The job could not be queued yet: ${reason}`;
}

function applyContextSessionState(ctx: BotContext, nextSession: Partial<BotContext["session"]>): void {
  Object.assign(ctx.session, nextSession);
}

async function resolveContextAccount(ctx: BotContext): Promise<UserAccount | undefined> {
  if (!ctx.from || !ctx.chat) {
    return undefined;
  }

  const account = await getUserAccount({
    userId: ctx.from.id,
    chatId: ctx.chat.id,
    username: ctx.from.username,
    firstName: ctx.from.first_name
  });
  const nextSession = await syncChatSessionWithAccount(ctx.chat.id, account);
  applyContextSessionState(ctx, nextSession);
  return account;
}

async function resolveWritableAccount(ctx: BotContext): Promise<UserAccount | undefined> {
  const account = await resolveContextAccount(ctx);
  if (!ctx.from || !ctx.chat || !account) {
    return account;
  }

  const nextAccount = await ensureHistoryRetentionForWrite({
    userId: ctx.from.id,
    chatId: ctx.chat.id,
    username: ctx.from.username,
    firstName: ctx.from.first_name
  });
  if (nextAccount.historyRetentionEndsAt !== account.historyRetentionEndsAt) {
    const nextSession = await syncChatSessionWithAccount(ctx.chat.id, nextAccount);
    applyContextSessionState(ctx, nextSession);
  }

  return nextAccount;
}

async function buildStartText(ctx: BotContext): Promise<string> {
  const account = await resolveContextAccount(ctx);
  if (!ctx.from || !account) {
    return ctx.t("start_message");
  }

  return buildWelcomeMessage(getLocaleFromContext(ctx), ctx.from.id, account, ctx.t("start_message"));
}

function hasHistory(ctx: BotContext): boolean {
  return Boolean(ctx.session.mailboxHistory?.length);
}

function buildContextMenuKeyboard(
  ctx: BotContext,
  locale: SupportedLocale,
  hasMailbox = Boolean(ctx.session.mailbox),
  hasHistoryValue = hasHistory(ctx),
  highlightSubscription = false
) {
  return buildMainMenuKeyboard(locale, hasMailbox, hasHistoryValue, Boolean(ctx.session.mailbox?.note), highlightSubscription);
}

function getHistoryItemByIndex(ctx: BotContext, index: number): MailboxSession | undefined {
  return Number.isInteger(index) && index >= 0 ? ctx.session.mailboxHistory?.[index] : undefined;
}

function getCommandArgumentText(ctx: BotContext): string {
  const text = ctx.message?.text ?? "";
  const firstSpaceIndex = text.indexOf(" ");
  return firstSpaceIndex >= 0 ? text.slice(firstSpaceIndex + 1).trim() : "";
}

function buildImportedMailbox(email: string, existingMailbox?: MailboxSession): MailboxSession {
  const now = new Date().toISOString();
  const koreanProfile = existingMailbox?.koreanProfile
    ?? existingMailbox?.koreanProfiles?.[0]
    ?? buildKoreanProfile();
  const existingIdentity = existingMailbox?.identity?.fullName && existingMailbox?.identity?.birthDate
    ? existingMailbox.identity
    : undefined;
  const identity = existingIdentity ?? {
    fullName: koreanProfile.fullName ?? buildRecommendedName(),
    birthDate: koreanProfile.birthDate ?? buildAdultBirthDate(25, 39)
  };

  return {
    email,
    code: existingMailbox?.code ?? "",
    domain: extractDomain(email),
    origin: "imported",
    note: existingMailbox?.note,
    password: existingMailbox?.password ?? buildReadablePassword(),
    koreanProfile,
    identity,
    virtualCards: existingMailbox?.virtualCards ?? generateVirtualCards("625814260", 1),
    sourceUrl: existingMailbox?.sourceUrl ?? MAILTICKING_URL,
    createdAt: existingMailbox?.createdAt ?? now,
    updatedAt: now
  };
}

function normalizeMailboxNote(value: string): string {
  return value.replace(/\r/g, "").trim().slice(0, MAX_MAILBOX_NOTE_LENGTH);
}

async function setPendingTextInput(ctx: BotContext, type?: "import-email" | "mailbox-note"): Promise<void> {
  const pendingTextInput = type
    ? {
        type,
        requestedAt: new Date().toISOString()
      }
    : undefined;

  if (ctx.chat) {
    await patchChatSession(ctx.chat.id, (current) => ({
      ...current,
      pendingTextInput
    }));
  }

  ctx.session.pendingTextInput = pendingTextInput;
}

async function clearPendingTextInput(ctx: BotContext): Promise<void> {
  if (!ctx.session.pendingTextInput) {
    return;
  }

  await setPendingTextInput(ctx);
}

async function openImportPrompt(ctx: BotContext): Promise<void> {
  const locale = getLocaleFromContext(ctx);
  await setPendingTextInput(ctx, "import-email");
  await ctx.reply(buildImportPromptMessage(locale), {
    parse_mode: "HTML",
    reply_markup: buildImportKeyboard(locale)
  });
}

async function openNotePrompt(ctx: BotContext): Promise<void> {
  const locale = getLocaleFromContext(ctx);
  if (!ctx.session.mailbox) {
    await ctx.reply(ctx.t("mailbox_missing"), {
      reply_markup: buildContextMenuKeyboard(ctx, locale, false)
    });
    return;
  }

  await setPendingTextInput(ctx, "mailbox-note");
  await ctx.reply(buildNotePromptMessage(locale, ctx.session.mailbox.email), {
    parse_mode: "HTML",
    reply_markup: buildImportKeyboard(locale)
  });
}

async function importMailbox(ctx: BotContext, rawEmail: string): Promise<void> {
  if (!ctx.chat || !ctx.from) {
    return;
  }

  const locale = getLocaleFromContext(ctx);
  const account = await resolveWritableAccount(ctx);
  const email = normalizeEmailAddress(rawEmail);

  if (!isValidEmailAddress(email)) {
    await ctx.reply(buildImportInvalidFormatMessage(locale), {
      parse_mode: "HTML",
      reply_markup: buildImportKeyboard(locale)
    });
    return;
  }

  const existingMailbox = ctx.session.mailbox?.email === email
    ? ctx.session.mailbox
    : findMailboxInHistory(ctx.session.mailboxHistory, email);
  const importedMailbox = buildImportedMailbox(email, existingMailbox);
  const nextHistory = mergeMailboxHistory(ctx.session.mailboxHistory, importedMailbox, account?.historyLimit ?? MAX_MAILBOX_HISTORY_ITEMS);

  const nextSession = await patchChatSession(ctx.chat.id, (current) => ({
    ...current,
    mailbox: importedMailbox,
    mailboxHistory: nextHistory,
    inboxCache: undefined,
    pendingTextInput: undefined
  }));

  applyContextSessionState(ctx, nextSession);

  await ctx.reply(buildImportQueuedMessage(locale, email), {
    parse_mode: "HTML",
    reply_markup: buildProcessingKeyboard(locale)
  });

  const queued = await enqueueMailJob({
    chatId: ctx.chat.id,
    userId: ctx.from.id,
    locale,
    type: "refresh",
    requestedAt: new Date().toISOString()
  });

  if (!queued.ok) {
    await ctx.reply(queueRejectedCopy(locale, queued.reason), {
      reply_markup: buildContextMenuKeyboard(ctx, locale)
    });
  }
}

async function saveMailboxNote(ctx: BotContext, rawNote: string): Promise<void> {
  if (!ctx.chat) {
    return;
  }

  const locale = getLocaleFromContext(ctx);
  const account = await resolveContextAccount(ctx);
  const activeMailbox = ctx.session.mailbox;
  if (!activeMailbox) {
    await clearPendingTextInput(ctx);
    await ctx.reply(ctx.t("mailbox_missing"), {
      reply_markup: buildContextMenuKeyboard(ctx, locale, false)
    });
    return;
  }

  const note = normalizeMailboxNote(rawNote);
  if (!note) {
    await ctx.reply(buildNoteInvalidMessage(locale), {
      parse_mode: "HTML",
      reply_markup: buildImportKeyboard(locale)
    });
    return;
  }

  const nextMailbox: MailboxSession = {
    ...activeMailbox,
    note
  };
  const nextHistory = mergeMailboxHistory(ctx.session.mailboxHistory, nextMailbox, account?.historyLimit ?? MAX_MAILBOX_HISTORY_ITEMS);

  const nextSession = await patchChatSession(ctx.chat.id, (current) => ({
    ...current,
    mailbox: nextMailbox,
    mailboxHistory: mergeMailboxHistory(current.mailboxHistory, nextMailbox, account?.historyLimit ?? MAX_MAILBOX_HISTORY_ITEMS),
    pendingTextInput: undefined
  }));

  applyContextSessionState(ctx, nextSession);

  await ctx.reply(buildNoteSavedMessage(locale, nextMailbox.email), {
    parse_mode: "HTML",
    reply_markup: buildContextMenuKeyboard(ctx, locale, true)
  });
}

async function deleteMailboxNote(ctx: BotContext): Promise<void> {
  const locale = getLocaleFromContext(ctx);
  await clearPendingTextInput(ctx);
  const account = await resolveContextAccount(ctx);

  if (!ctx.chat || !ctx.session.mailbox) {
    await ctx.reply(ctx.t("mailbox_missing"), {
      reply_markup: buildContextMenuKeyboard(ctx, locale, false)
    });
    return;
  }

  if (!ctx.session.mailbox.note) {
    await ctx.reply(buildNoteDeleteMissingMessage(locale), {
      parse_mode: "HTML",
      reply_markup: buildContextMenuKeyboard(ctx, locale, true)
    });
    return;
  }

  const nextMailbox: MailboxSession = {
    ...ctx.session.mailbox,
    note: undefined
  };
  const nextHistory = mergeMailboxHistory(ctx.session.mailboxHistory, nextMailbox, account?.historyLimit ?? MAX_MAILBOX_HISTORY_ITEMS);

  const nextSession = await patchChatSession(ctx.chat.id, (current) => ({
    ...current,
    mailbox: nextMailbox,
    mailboxHistory: mergeMailboxHistory(current.mailboxHistory, nextMailbox, account?.historyLimit ?? MAX_MAILBOX_HISTORY_ITEMS),
    pendingTextInput: undefined
  }));

  applyContextSessionState(ctx, nextSession);

  await ctx.reply(buildNoteDeletedMessage(locale, nextMailbox.email), {
    parse_mode: "HTML",
    reply_markup: buildContextMenuKeyboard(ctx, locale, true)
  });
}

async function resetBrowserSession(ctx: BotContext): Promise<void> {
  const locale = getLocaleFromContext(ctx);
  await clearPendingTextInput(ctx);
  await resolveContextAccount(ctx);

  if (!ctx.chat || !ctx.session.mailbox) {
    await ctx.reply(ctx.t("mailbox_missing"), {
      reply_markup: buildContextMenuKeyboard(ctx, locale, false)
    });
    return;
  }

  await clearBrowserState(ctx.chat.id);
  const nextSession = await patchChatSession(ctx.chat.id, (current) => ({
    ...current,
    inboxCache: undefined
  }));

  applyContextSessionState(ctx, nextSession);

  await ctx.reply(buildResetSessionDoneMessage(locale, ctx.session.mailbox.email), {
    parse_mode: "HTML",
    reply_markup: buildContextMenuKeyboard(ctx, locale, true)
  });
}

async function queueJob(ctx: BotContext, type: MailJobType): Promise<void> {
  if (!ctx.chat || !ctx.from) {
    return;
  }

  const locale = getLocaleFromContext(ctx);
  await resolveContextAccount(ctx);
  await clearPendingTextInput(ctx);
  if (type !== "generate" && !ctx.session.mailbox) {
    await ctx.reply(ctx.t("mailbox_missing"), {
      reply_markup: buildContextMenuKeyboard(ctx, locale, false)
    });
    return;
  }

  await ctx.api.sendChatAction(ctx.chat.id, "typing");
  const queued = await enqueueMailJob({
    chatId: ctx.chat.id,
    userId: ctx.from.id,
    locale,
    type,
    requestedAt: new Date().toISOString()
  });

  if (!queued.ok) {
    await ctx.reply(queueRejectedCopy(locale, queued.reason), {
      reply_markup: buildContextMenuKeyboard(ctx, locale)
    });
    return;
  }

  await ctx.reply(queueAcceptedCopy(locale, type), {
    reply_markup: buildProcessingKeyboard(locale)
  });
}

async function showInbox(ctx: BotContext): Promise<void> {
  const locale = getLocaleFromContext(ctx);
  await resolveContextAccount(ctx);
  await clearPendingTextInput(ctx);
  if (!ctx.session.mailbox) {
    await ctx.reply(ctx.t("mailbox_missing"), {
      reply_markup: buildContextMenuKeyboard(ctx, locale, false)
    });
    return;
  }

  await ctx.api.sendChatAction(ctx.chat!.id, "typing");
  await ctx.reply(buildInboxMessage(locale, ctx.session.mailbox, ctx.session.inboxCache), {
    parse_mode: "HTML",
    reply_markup: buildContextMenuKeyboard(ctx, locale, true)
  });
}

async function showHistory(ctx: BotContext): Promise<void> {
  const locale = getLocaleFromContext(ctx);
  await resolveContextAccount(ctx);
  await clearPendingTextInput(ctx);
  const history = ctx.session.mailboxHistory ?? [];

  await ctx.reply(buildHistoryMessage(locale, history, ctx.session.mailbox?.email), {
    parse_mode: "HTML",
    reply_markup: buildHistoryKeyboard(locale, history, ctx.session.mailbox?.email)
  });
}

async function restoreMailbox(ctx: BotContext, index: number): Promise<void> {
  if (!ctx.chat || !ctx.from) {
    return;
  }

  const locale = getLocaleFromContext(ctx);
  await clearPendingTextInput(ctx);
  const account = await resolveContextAccount(ctx);
  const selected = getHistoryItemByIndex(ctx, index);
  if (!selected) {
    await ctx.reply(buildRestoreMissingMessage(locale), {
      parse_mode: "HTML",
      reply_markup: buildContextMenuKeyboard(ctx, locale)
    });
    return;
  }

  const nextHistory = mergeMailboxHistory(ctx.session.mailboxHistory, selected, account?.historyLimit ?? MAX_MAILBOX_HISTORY_ITEMS);
  const nextSession = await patchChatSession(ctx.chat.id, (current) => ({
    ...current,
    mailbox: selected,
    mailboxHistory: nextHistory,
    inboxCache: undefined
  }));

  applyContextSessionState(ctx, nextSession);

  await ctx.reply(buildRestoreQueuedMessage(locale, selected.email), {
    parse_mode: "HTML",
    reply_markup: buildProcessingKeyboard(locale)
  });

  const queued = await enqueueMailJob({
    chatId: ctx.chat.id,
    userId: ctx.from.id,
    locale,
    type: "refresh",
    requestedAt: new Date().toISOString()
  });

  if (!queued.ok) {
    await ctx.reply(queueRejectedCopy(locale, queued.reason), {
      reply_markup: buildContextMenuKeyboard(ctx, locale)
    });
  }
}

async function deleteHistoryEntry(ctx: BotContext, index: number): Promise<void> {
  const locale = getLocaleFromContext(ctx);
  await resolveContextAccount(ctx);
  await clearPendingTextInput(ctx);
  const selected = getHistoryItemByIndex(ctx, index);

  if (!selected) {
    await ctx.answerCallbackQuery({ text: locale === "id" ? "History tidak ditemukan" : "History entry not found" });
    await ctx.reply(buildDeleteHistoryMissingMessage(locale), {
      parse_mode: "HTML",
      reply_markup: buildContextMenuKeyboard(ctx, locale)
    });
    return;
  }

  if (selected.email === ctx.session.mailbox?.email) {
    await ctx.answerCallbackQuery({ text: locale === "id" ? "Email aktif tidak bisa dihapus" : "Active email cannot be deleted" });
    await ctx.reply(buildDeleteCurrentHistoryMessage(locale), {
      parse_mode: "HTML",
      reply_markup: buildContextMenuKeyboard(ctx, locale)
    });
    return;
  }

  const nextHistory = (ctx.session.mailboxHistory ?? []).filter((_, historyIndex) => historyIndex !== index);
  if (ctx.chat) {
    const nextSession = await patchChatSession(ctx.chat.id, (current) => ({
      ...current,
      mailboxHistory: nextHistory
    }));
    applyContextSessionState(ctx, nextSession);
  }

  await ctx.answerCallbackQuery({ text: locale === "id" ? "History dihapus" : "History deleted" });
  await ctx.editMessageText(buildHistoryMessage(locale, nextHistory, ctx.session.mailbox?.email), {
    parse_mode: "HTML",
    reply_markup: buildHistoryKeyboard(locale, nextHistory, ctx.session.mailbox?.email)
  });
  await ctx.reply(buildDeleteHistoryDoneMessage(locale), {
    parse_mode: "HTML",
    reply_markup: buildContextMenuKeyboard(ctx, locale)
  });
}

function parseSetPlanCommand(input: string): { userId: number; plan: "free" | "paid" | "custom"; customHistoryLimit?: number } | undefined {
  const [userIdText = "", planText = "", limitText] = input.trim().split(/\s+/);
  const userId = Number(userIdText);
  if (!Number.isInteger(userId) || userId <= 0) {
    return undefined;
  }

  if (planText === "free" || planText === "paid") {
    return { userId, plan: planText };
  }

  if (planText === "custom") {
    const customHistoryLimit = Number(limitText);
    if (!Number.isInteger(customHistoryLimit) || customHistoryLimit < MAX_MAILBOX_HISTORY_ITEMS) {
      return undefined;
    }

    return { userId, plan: "custom", customHistoryLimit };
  }

  return undefined;
}

async function showPlanStatus(ctx: BotContext): Promise<void> {
  if (!ctx.from || !ctx.chat) {
    return;
  }

  const locale = getLocaleFromContext(ctx);
  const account = await resolveContextAccount(ctx);
  if (!account) {
    return;
  }

  await clearPendingTextInput(ctx);
  await ctx.reply(buildAccountStatusMessage(locale, ctx.from.id, account), {
    parse_mode: "HTML",
    reply_markup: buildSubscriptionKeyboard(locale, ctx.from.id, ctx.from.username)
  });
}

async function openSubscription(ctx: BotContext): Promise<void> {
  if (!ctx.from || !ctx.chat) {
    return;
  }

  const locale = getLocaleFromContext(ctx);
  const account = await resolveContextAccount(ctx);
  if (!account) {
    return;
  }

  await clearPendingTextInput(ctx);
  await ctx.reply(buildSubscriptionMessage(locale, ctx.from.id, account), {
    parse_mode: "HTML",
    reply_markup: buildSubscriptionKeyboard(locale, ctx.from.id, ctx.from.username)
  });
}

async function handleSetPlanCommand(ctx: BotContext): Promise<void> {
  const locale = getLocaleFromContext(ctx);
  if (!isAdminAccount(ctx.from?.username)) {
    await ctx.reply(buildAdminOnlyMessage(locale), {
      parse_mode: "HTML",
      reply_markup: buildContextMenuKeyboard(ctx, locale)
    });
    return;
  }

  const parsed = parseSetPlanCommand(getCommandArgumentText(ctx));
  if (!parsed) {
    await ctx.reply(buildAdminSetPlanUsageMessage(locale), {
      parse_mode: "HTML",
      reply_markup: buildContextMenuKeyboard(ctx, locale)
    });
    return;
  }

  const account = await setUserPlan(parsed);
  const nextSession = await syncChatSessionWithAccount(account.chatId, account).catch(() => undefined);
  if (account.chatId === ctx.chat?.id && nextSession) {
    applyContextSessionState(ctx, nextSession);
  }

  await ctx.reply(buildAdminPlanUpdatedMessage(locale, parsed.userId, account), {
    parse_mode: "HTML",
    reply_markup: buildContextMenuKeyboard(ctx, locale)
  });

  if (parsed.userId !== ctx.from?.id) {
    const targetLocale = locale;
    const notification = parsed.plan === "free"
      ? buildPlanExpiredMessage(targetLocale)
      : buildAccountStatusMessage(targetLocale, parsed.userId, account);
    await ctx.api.sendMessage(parsed.userId, notification, {
      parse_mode: "HTML"
    }).catch(() => undefined);
  }
}

function createI18n(): I18n<BotContext> {
  return new I18n<BotContext>({
    defaultLocale: "id",
    useSession: true,
    directory: path.join(process.cwd(), "locales")
  });
}

function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(getBotToken());
  bot.use(
    session({
      initial: createInitialSessionData,
      storage: createSessionStorage()
    })
  );
  bot.use(createI18n());
  bot.use(
    limit({
      timeFrame: 2_500,
      limit: 4,
      storageClient: getRedisClient(),
      keyGenerator: (ctx) => ctx.from?.id.toString(),
      onLimitExceeded: async (ctx) => {
        if (!ctx.chat) {
          return;
        }

        const locale = getLocaleFromContext(ctx);
        await ctx.api.sendMessage(
          ctx.chat.id,
          locale === "id" ? "Terlalu cepat. Tunggu sebentar lalu coba lagi." : "Too many requests. Please wait a moment and try again.",
          {
            reply_markup: buildContextMenuKeyboard(ctx, locale)
          }
        );
      }
    })
  );

  bot.command("start", async (ctx) => {
    const locale = getLocaleFromContext(ctx);
    await clearPendingTextInput(ctx);
    await ctx.reply(await buildStartText(ctx), {
      parse_mode: "HTML",
      reply_markup: buildContextMenuKeyboard(ctx, locale, Boolean(ctx.session.mailbox), hasHistory(ctx), true)
    });
  });

  bot.command("generate", async (ctx) => {
    await queueJob(ctx, "generate");
  });

  bot.command("refresh", async (ctx) => {
    await queueJob(ctx, "refresh");
  });

  bot.command("inbox", async (ctx) => {
    await showInbox(ctx);
  });

  bot.command("history", async (ctx) => {
    await showHistory(ctx);
  });

  bot.command("note", async (ctx) => {
    const rawNote = getCommandArgumentText(ctx);
    if (rawNote) {
      await saveMailboxNote(ctx, rawNote);
      return;
    }

    await openNotePrompt(ctx);
  });

  bot.command("import", async (ctx) => {
    const rawEmail = getCommandArgumentText(ctx);
    if (rawEmail) {
      await importMailbox(ctx, rawEmail);
      return;
    }

    await openImportPrompt(ctx);
  });

  bot.command("language", async (ctx) => {
    const locale = getLocaleFromContext(ctx);
    await clearPendingTextInput(ctx);
    await ctx.reply(ctx.t("language_prompt"), {
      reply_markup: buildLanguageKeyboard(locale)
    });
  });

  bot.command("plan", async (ctx) => {
    await showPlanStatus(ctx);
  });

  bot.command("subscription", async (ctx) => {
    await openSubscription(ctx);
  });

  bot.command("setplan", async (ctx) => {
    await handleSetPlanCommand(ctx);
  });

  bot.on("message:text", async (ctx) => {
    if (!ctx.session.pendingTextInput || ctx.message.text.startsWith("/")) {
      return;
    }

    if (ctx.session.pendingTextInput.type === "import-email") {
      await importMailbox(ctx, ctx.message.text);
      return;
    }

    if (ctx.session.pendingTextInput.type === "mailbox-note") {
      await saveMailboxNote(ctx, ctx.message.text);
    }
  });

  bot.callbackQuery("mt:generate", async (ctx) => {
    await ctx.answerCallbackQuery();
    await queueJob(ctx, "generate");
  });

  bot.callbackQuery("mt:refresh", async (ctx) => {
    await ctx.answerCallbackQuery();
    await queueJob(ctx, "refresh");
  });

  bot.callbackQuery("mt:inbox", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showInbox(ctx);
  });

  bot.callbackQuery("mt:history", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showHistory(ctx);
  });

  bot.callbackQuery("mt:subscription:open", async (ctx) => {
    await ctx.answerCallbackQuery();
    await openSubscription(ctx);
  });

  bot.callbackQuery("mt:note:open", async (ctx) => {
    await ctx.answerCallbackQuery();
    await openNotePrompt(ctx);
  });

  bot.callbackQuery("mt:note:delete", async (ctx) => {
    await ctx.answerCallbackQuery();
    await deleteMailboxNote(ctx);
  });

  bot.callbackQuery("mt:session:reset", async (ctx) => {
    await ctx.answerCallbackQuery();
    await resetBrowserSession(ctx);
  });

  bot.callbackQuery("mt:import:open", async (ctx) => {
    await ctx.answerCallbackQuery();
    await openImportPrompt(ctx);
  });

  bot.callbackQuery(/^mt:restore:i:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await restoreMailbox(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery(/^mt:delete:i:(\d+)$/, async (ctx) => {
    await deleteHistoryEntry(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery("mt:lang:open", async (ctx) => {
    const locale = getLocaleFromContext(ctx);
    await ctx.answerCallbackQuery();
    await clearPendingTextInput(ctx);
    await ctx.reply(ctx.t("language_prompt"), {
      reply_markup: buildLanguageKeyboard(locale)
    });
  });

  bot.callbackQuery(/^mt:lang:set:(id|en)$/, async (ctx) => {
    const locale = ctx.match[1] as SupportedLocale;
    await ctx.i18n.setLocale(locale);
    await ctx.answerCallbackQuery(locale === "id" ? "Bahasa diubah" : "Language updated");
    await ctx.reply(locale === "id" ? "Bahasa aktif: Indonesia" : "Active language: English", {
      reply_markup: buildContextMenuKeyboard(ctx, locale)
    });
  });

  bot.callbackQuery("mt:menu", async (ctx) => {
    const locale = getLocaleFromContext(ctx);
    await ctx.answerCallbackQuery();
    await clearPendingTextInput(ctx);
    await ctx.reply(await buildStartText(ctx), {
      parse_mode: "HTML",
      reply_markup: buildContextMenuKeyboard(ctx, locale, Boolean(ctx.session.mailbox), hasHistory(ctx), true)
    });
  });

  bot.callbackQuery("mt:noop", async (ctx) => {
    const locale = getLocaleFromContext(ctx);
    await ctx.answerCallbackQuery(
      locale === "id" ? "Masih diproses, mohon tunggu..." : "Still processing, please wait..."
    );
  });

  bot.catch((error) => {
    console.error("bot-error", error.error);
  });

  return bot;
}

export function getBot(): Bot<BotContext> {
  const cache = globalThis as GlobalBotCache;
  if (!cache.__mailTickingBot) {
    cache.__mailTickingBot = createBot();
  }

  return cache.__mailTickingBot;
}
