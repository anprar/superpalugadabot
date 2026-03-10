import { getBot } from "./bot.js";
import { buildMainMenuKeyboard } from "./keyboards.js";
import {
  buildInboxMessage,
  buildMailboxExpiredMessage,
  buildMailboxReadyMessage,
  buildWorkerErrorMessage
} from "./messages.js";
import { generateMailbox, MailboxExpiredError, refreshInbox } from "./scraper.js";
import {
  clearMailboxState,
  getBrowserState,
  getChatSession,
  patchChatSession,
  releaseJobLock,
  saveBrowserState
} from "./sessions.js";
import type { BrowserStorageState, MailJobPayload, ScraperMailboxResult, ScraperRefreshResult } from "./types.js";

async function sendResultMessage(chatId: number, locale: MailJobPayload["locale"], text: string, hasMailbox: boolean): Promise<void> {
  await getBot().api.sendMessage(chatId, text, {
    parse_mode: "HTML",
    reply_markup: buildMainMenuKeyboard(locale, hasMailbox)
  });
}

function clearPendingJob(payload: MailJobPayload) {
  return patchChatSession(payload.chatId, (current) => ({
    ...current,
    pendingJob: current.pendingJob?.type === payload.type ? undefined : current.pendingJob
  }));
}

export async function runMailJob(payload: MailJobPayload): Promise<void> {
  const session = await getChatSession(payload.chatId);
  const locale = session.__language_code ?? payload.locale;

  try {
    const bot = getBot();
    await bot.init();
    await bot.api.sendChatAction(payload.chatId, "typing");

    if (payload.type === "generate") {
      const previousBrowserState = await getBrowserState<BrowserStorageState>(payload.chatId);
      const result = await generateMailbox(previousBrowserState);
      await persistMailboxResult(payload.chatId, result);
      await sendResultMessage(payload.chatId, locale, buildMailboxReadyMessage(locale, result.mailbox, result.inboxCache), true);
      return;
    }

    if (!session.mailbox) {
      throw new MailboxExpiredError();
    }

    const browserState = await getBrowserState<BrowserStorageState>(payload.chatId);
    const refreshed = await refreshInbox(session.mailbox, browserState);
    await persistRefreshResult(payload.chatId, refreshed);
    await sendResultMessage(payload.chatId, locale, buildInboxMessage(locale, refreshed.mailbox, refreshed.inboxCache), true);
  } catch (error) {
    if (error instanceof MailboxExpiredError) {
      await clearMailboxState(payload.chatId);
      await getBot().api.sendMessage(payload.chatId, buildMailboxExpiredMessage(locale), {
        parse_mode: "HTML",
        reply_markup: buildMainMenuKeyboard(locale, false)
      });
      return;
    }

    console.error("mail-job-error", error);
    await getBot().api.sendMessage(payload.chatId, buildWorkerErrorMessage(locale), {
      parse_mode: "HTML",
      reply_markup: buildMainMenuKeyboard(locale, Boolean(session.mailbox))
    });
  } finally {
    await clearPendingJob(payload);
    await releaseJobLock(payload.chatId, payload.type);
  }
}

async function persistMailboxResult(chatId: number, result: ScraperMailboxResult): Promise<void> {
  await saveBrowserState(chatId, result.storageState);
  await patchChatSession(chatId, (current) => ({
    ...current,
    mailbox: result.mailbox,
    inboxCache: result.inboxCache,
    pendingJob: undefined
  }));
}

async function persistRefreshResult(chatId: number, result: ScraperRefreshResult): Promise<void> {
  await saveBrowserState(chatId, result.storageState);
  await patchChatSession(chatId, (current) => ({
    ...current,
    mailbox: result.mailbox,
    inboxCache: result.inboxCache,
    pendingJob: undefined
  }));
}
