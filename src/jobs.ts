import { ALLOWED_MAILBOX_DOMAINS } from "./config.js";
import { getBot } from "./bot.js";
import { buildMainMenuKeyboard } from "./keyboards.js";
import {
  buildAllowedDomainsBusyMessage,
  buildInboxMessage,
  buildMailboxExpiredMessage,
  buildMailboxReadyMessage,
  buildWorkerErrorMessage
} from "./messages.js";
import { AllowedMailboxUnavailableError, generateMailbox, MailboxExpiredError, refreshInbox } from "./scraper.js";
import {
  clearMailboxState,
  getBrowserState,
  getChatSession,
  mergeMailboxHistory,
  patchChatSession,
  releaseJobLock,
  saveBrowserState
} from "./sessions.js";
import type { BrowserStorageState, MailJobPayload, ScraperMailboxResult, ScraperRefreshResult } from "./types.js";

function toLoggableError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return error;
}

async function sendResultMessage(
  chatId: number,
  locale: MailJobPayload["locale"],
  text: string,
  hasMailbox: boolean,
  hasHistory: boolean,
  hasNote = false
): Promise<void> {
  await getBot().api.sendMessage(chatId, text, {
    parse_mode: "HTML",
    reply_markup: buildMainMenuKeyboard(locale, hasMailbox, hasHistory, hasNote)
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
  const startedAt = Date.now();

  console.info("mail-job-start", {
    chatId: payload.chatId,
    type: payload.type,
    requestedAt: payload.requestedAt
  });

  try {
    const bot = getBot();
    await bot.init();
    await bot.api.sendChatAction(payload.chatId, "typing");

    if (payload.type === "generate") {
      const previousBrowserState = await getBrowserState<BrowserStorageState>(payload.chatId);
      const result = await generateMailbox(previousBrowserState);
      const nextSession = await persistMailboxResult(payload.chatId, result);
      await sendResultMessage(
        payload.chatId,
        locale,
        buildMailboxReadyMessage(locale, result.mailbox, result.inboxCache),
        true,
        Boolean(nextSession.mailboxHistory?.length),
        Boolean(result.mailbox.note)
      );
      console.info("mail-job-success", {
        chatId: payload.chatId,
        type: payload.type,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    if (!session.mailbox) {
      throw new MailboxExpiredError();
    }

    const browserState = await getBrowserState<BrowserStorageState>(payload.chatId);
    const refreshed = await refreshInbox(session.mailbox, browserState);
    const nextSession = await persistRefreshResult(payload.chatId, refreshed);
    await sendResultMessage(
      payload.chatId,
      locale,
      buildInboxMessage(locale, refreshed.mailbox, refreshed.inboxCache),
      true,
      Boolean(nextSession.mailboxHistory?.length),
      Boolean(refreshed.mailbox.note)
    );
    console.info("mail-job-success", {
      chatId: payload.chatId,
      type: payload.type,
      durationMs: Date.now() - startedAt
    });
  } catch (error) {
    if (error instanceof MailboxExpiredError) {
      await clearMailboxState(payload.chatId);
      await getBot().api.sendMessage(payload.chatId, buildMailboxExpiredMessage(locale), {
        parse_mode: "HTML",
        reply_markup: buildMainMenuKeyboard(locale, false, Boolean(session.mailboxHistory?.length), false)
      });
      return;
    }

    if (error instanceof AllowedMailboxUnavailableError) {
      await getBot().api.sendMessage(payload.chatId, buildAllowedDomainsBusyMessage(locale, [...ALLOWED_MAILBOX_DOMAINS]), {
        parse_mode: "HTML",
        reply_markup: buildMainMenuKeyboard(
          locale,
          Boolean(session.mailbox),
          Boolean(session.mailboxHistory?.length),
          Boolean(session.mailbox?.note)
        )
      });
      return;
    }

    console.error("mail-job-error", {
      chatId: payload.chatId,
      type: payload.type,
      durationMs: Date.now() - startedAt,
      error: toLoggableError(error)
    });
    await getBot().api.sendMessage(payload.chatId, buildWorkerErrorMessage(locale), {
      parse_mode: "HTML",
      reply_markup: buildMainMenuKeyboard(
        locale,
        Boolean(session.mailbox),
        Boolean(session.mailboxHistory?.length),
        Boolean(session.mailbox?.note)
      )
    });
  } finally {
    await clearPendingJob(payload);
    await releaseJobLock(payload.chatId, payload.type);
  }
}

async function persistMailboxResult(chatId: number, result: ScraperMailboxResult) {
  await saveBrowserState(chatId, result.storageState);
  return patchChatSession(chatId, (current) => ({
    ...current,
    mailbox: result.mailbox,
    mailboxHistory: mergeMailboxHistory(current.mailboxHistory, result.mailbox),
    inboxCache: result.inboxCache,
    pendingJob: undefined
  }));
}

async function persistRefreshResult(chatId: number, result: ScraperRefreshResult) {
  await saveBrowserState(chatId, result.storageState);
  return patchChatSession(chatId, (current) => ({
    ...current,
    mailbox: result.mailbox,
    mailboxHistory: mergeMailboxHistory(current.mailboxHistory, result.mailbox),
    inboxCache: result.inboxCache,
    pendingJob: undefined
  }));
}
