import path from "node:path";
import { I18n } from "@grammyjs/i18n";
import { limit } from "@grammyjs/ratelimiter";
import { Bot, session } from "grammy";
import { getBotToken, getSupportedLocale } from "./config.js";
import { buildMainMenuKeyboard, buildLanguageKeyboard } from "./keyboards.js";
import { buildInboxMessage } from "./messages.js";
import { enqueueMailJob } from "./queue.js";
import { createInitialSessionData, createSessionStorage, getRedisClient } from "./sessions.js";
import type { BotContext, MailJobType, SupportedLocale } from "./types.js";

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

async function queueJob(ctx: BotContext, type: MailJobType): Promise<void> {
  if (!ctx.chat || !ctx.from) {
    return;
  }

  const locale = getLocaleFromContext(ctx);
  if (type !== "generate" && !ctx.session.mailbox) {
    await ctx.reply(ctx.t("mailbox_missing"), {
      reply_markup: buildMainMenuKeyboard(locale, false)
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
      reply_markup: buildMainMenuKeyboard(locale, Boolean(ctx.session.mailbox))
    });
    return;
  }

  await ctx.reply(queueAcceptedCopy(locale, type), {
    reply_markup: buildMainMenuKeyboard(locale, Boolean(ctx.session.mailbox))
  });
}

async function showInbox(ctx: BotContext): Promise<void> {
  const locale = getLocaleFromContext(ctx);
  if (!ctx.session.mailbox) {
    await ctx.reply(ctx.t("mailbox_missing"), {
      reply_markup: buildMainMenuKeyboard(locale, false)
    });
    return;
  }

  await ctx.api.sendChatAction(ctx.chat!.id, "typing");
  await ctx.reply(buildInboxMessage(locale, ctx.session.mailbox, ctx.session.inboxCache), {
    parse_mode: "HTML",
    reply_markup: buildMainMenuKeyboard(locale, true)
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
            reply_markup: buildMainMenuKeyboard(locale, Boolean(ctx.session.mailbox))
          }
        );
      }
    })
  );

  bot.command("start", async (ctx) => {
    const locale = getLocaleFromContext(ctx);
    await ctx.reply(buildStartText(ctx), {
      reply_markup: buildMainMenuKeyboard(locale, Boolean(ctx.session.mailbox))
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
      reply_markup: buildMainMenuKeyboard(locale, Boolean(ctx.session.mailbox))
    });
  });

  bot.callbackQuery("mt:menu", async (ctx) => {
    const locale = getLocaleFromContext(ctx);
    await ctx.answerCallbackQuery();
    await ctx.reply(buildStartText(ctx), {
      reply_markup: buildMainMenuKeyboard(locale, Boolean(ctx.session.mailbox))
    });
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
