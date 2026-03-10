import path from "node:path";
import { I18n } from "@grammyjs/i18n";
import { limit } from "@grammyjs/ratelimiter";
import { Bot, session } from "grammy";
import { getBotToken, getSupportedLocale } from "./config.js";
import { buildHistoryKeyboard, buildLanguageKeyboard, buildMainMenuKeyboard, buildProcessingKeyboard } from "./keyboards.js";
import {
  buildDeleteCurrentHistoryMessage,
  buildDeleteHistoryDoneMessage,
  buildDeleteHistoryMissingMessage,
  buildHistoryMessage,
  buildInboxMessage,
  buildRestoreMissingMessage,
  buildRestoreQueuedMessage
} from "./messages.js";
import { enqueueMailJob } from "./queue.js";
import { clearBrowserState, createInitialSessionData, createSessionStorage, getRedisClient, mergeMailboxHistory, patchChatSession } from "./sessions.js";
import type { BotContext, MailJobType, MailboxSession, SupportedLocale } from "./types.js";

type GlobalBotCache = typeof globalThis & { __mailTickingBot?: Bot<BotContext> };

function getLocaleFromContext(ctx: BotContext): SupportedLocale {
  return getSupportedLocale(ctx.session.__language_code ?? ctx.from?.language_code);
}

function queueAcceptedCopy(locale: SupportedLocale, type: MailJobType): string {
  const copy = {
    id: {
      generate: "Sedang membuat email MailTicking baru. Tunggu sebentar...",
      refresh: "Sedang refresh inbox MailTicking. Tunggu sebentar..."
    },
    en: {
      generate: "Creating a fresh MailTicking mailbox. Please wait...",
      refresh: "Refreshing the MailTicking inbox. Please wait..."
    }
  } as const;

  return copy[locale][type];
}

function queueRejectedCopy(locale: SupportedLocale, reason: string): string {
  return locale === "id"
    ? `Job belum bisa dijalankan: ${reason}`
    : `The job could not be queued yet: ${reason}`;
}

function buildStartText(ctx: BotContext): string {
  return ctx.t("start_message");
}

function hasHistory(ctx: BotContext): boolean {
  return Boolean(ctx.session.mailboxHistory?.length);
}

function getHistoryItemByIndex(ctx: BotContext, index: number): MailboxSession | undefined {
  return Number.isInteger(index) && index >= 0 ? ctx.session.mailboxHistory?.[index] : undefined;
}

async function queueJob(ctx: BotContext, type: MailJobType): Promise<void> {
  if (!ctx.chat || !ctx.from) {
    return;
  }

  const locale = getLocaleFromContext(ctx);
  if (type !== "generate" && !ctx.session.mailbox) {
    await ctx.reply(ctx.t("mailbox_missing"), {
      reply_markup: buildMainMenuKeyboard(locale, false, hasHistory(ctx))
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
      reply_markup: buildMainMenuKeyboard(locale, Boolean(ctx.session.mailbox), hasHistory(ctx))
    });
    return;
  }

  await ctx.reply(queueAcceptedCopy(locale, type), {
    reply_markup: buildProcessingKeyboard(locale)
  });
}

async function showInbox(ctx: BotContext): Promise<void> {
  const locale = getLocaleFromContext(ctx);
  if (!ctx.session.mailbox) {
    await ctx.reply(ctx.t("mailbox_missing"), {
      reply_markup: buildMainMenuKeyboard(locale, false, hasHistory(ctx))
    });
    return;
  }

  await ctx.api.sendChatAction(ctx.chat!.id, "typing");
  await ctx.reply(buildInboxMessage(locale, ctx.session.mailbox, ctx.session.inboxCache), {
    parse_mode: "HTML",
    reply_markup: buildMainMenuKeyboard(locale, true, hasHistory(ctx))
  });
}

async function showHistory(ctx: BotContext): Promise<void> {
  const locale = getLocaleFromContext(ctx);
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
  const selected = getHistoryItemByIndex(ctx, index);
  if (!selected) {
    await ctx.reply(buildRestoreMissingMessage(locale), {
      parse_mode: "HTML",
      reply_markup: buildMainMenuKeyboard(locale, Boolean(ctx.session.mailbox), hasHistory(ctx))
    });
    return;
  }

  const nextHistory = mergeMailboxHistory(ctx.session.mailboxHistory, selected);
  await clearBrowserState(ctx.chat.id);
  await patchChatSession(ctx.chat.id, (current) => ({
    ...current,
    mailbox: selected,
    mailboxHistory: nextHistory,
    inboxCache: undefined
  }));

  ctx.session.mailbox = selected;
  ctx.session.mailboxHistory = nextHistory;
  ctx.session.inboxCache = undefined;

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
      reply_markup: buildMainMenuKeyboard(locale, Boolean(ctx.session.mailbox), hasHistory(ctx))
    });
  }
}

async function deleteHistoryEntry(ctx: BotContext, index: number): Promise<void> {
  const locale = getLocaleFromContext(ctx);
  const selected = getHistoryItemByIndex(ctx, index);

  if (!selected) {
    await ctx.answerCallbackQuery({ text: locale === "id" ? "History tidak ditemukan" : "History entry not found" });
    await ctx.reply(buildDeleteHistoryMissingMessage(locale), {
      parse_mode: "HTML",
      reply_markup: buildMainMenuKeyboard(locale, Boolean(ctx.session.mailbox), hasHistory(ctx))
    });
    return;
  }

  if (selected.email === ctx.session.mailbox?.email) {
    await ctx.answerCallbackQuery({ text: locale === "id" ? "Email aktif tidak bisa dihapus" : "Active email cannot be deleted" });
    await ctx.reply(buildDeleteCurrentHistoryMessage(locale), {
      parse_mode: "HTML",
      reply_markup: buildMainMenuKeyboard(locale, Boolean(ctx.session.mailbox), hasHistory(ctx))
    });
    return;
  }

  const nextHistory = (ctx.session.mailboxHistory ?? []).filter((_, historyIndex) => historyIndex !== index);
  if (ctx.chat) {
    await patchChatSession(ctx.chat.id, (current) => ({
      ...current,
      mailboxHistory: nextHistory
    }));
  }

  ctx.session.mailboxHistory = nextHistory;

  await ctx.answerCallbackQuery({ text: locale === "id" ? "History dihapus" : "History deleted" });
  await ctx.editMessageText(buildHistoryMessage(locale, nextHistory, ctx.session.mailbox?.email), {
    parse_mode: "HTML",
    reply_markup: buildHistoryKeyboard(locale, nextHistory, ctx.session.mailbox?.email)
  });
  await ctx.reply(buildDeleteHistoryDoneMessage(locale), {
    parse_mode: "HTML",
    reply_markup: buildMainMenuKeyboard(locale, Boolean(ctx.session.mailbox), hasHistory(ctx))
  });
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
            reply_markup: buildMainMenuKeyboard(locale, Boolean(ctx.session.mailbox), hasHistory(ctx))
          }
        );
      }
    })
  );

  bot.command("start", async (ctx) => {
    const locale = getLocaleFromContext(ctx);
    await ctx.reply(buildStartText(ctx), {
      reply_markup: buildMainMenuKeyboard(locale, Boolean(ctx.session.mailbox), hasHistory(ctx))
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

  bot.command("language", async (ctx) => {
    const locale = getLocaleFromContext(ctx);
    await ctx.reply(ctx.t("language_prompt"), {
      reply_markup: buildLanguageKeyboard(locale)
    });
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
    await ctx.reply(ctx.t("language_prompt"), {
      reply_markup: buildLanguageKeyboard(locale)
    });
  });

  bot.callbackQuery(/^mt:lang:set:(id|en)$/, async (ctx) => {
    const locale = ctx.match[1] as SupportedLocale;
    await ctx.i18n.setLocale(locale);
    await ctx.answerCallbackQuery(locale === "id" ? "Bahasa diubah" : "Language updated");
    await ctx.reply(locale === "id" ? "Bahasa aktif: Indonesia" : "Active language: English", {
      reply_markup: buildMainMenuKeyboard(locale, Boolean(ctx.session.mailbox), hasHistory(ctx))
    });
  });

  bot.callbackQuery("mt:menu", async (ctx) => {
    const locale = getLocaleFromContext(ctx);
    await ctx.answerCallbackQuery();
    await ctx.reply(buildStartText(ctx), {
      reply_markup: buildMainMenuKeyboard(locale, Boolean(ctx.session.mailbox), hasHistory(ctx))
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
