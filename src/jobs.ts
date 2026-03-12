import { ALLOWED_MAILBOX_DOMAINS } from "./config.js";
import { getBot } from "./bot.js";
import { buildMainMenuKeyboard } from "./keyboards.js";
import {
  buildAllowedDomainsBusyMessage,
  buildInboxMessage,
  buildJobProgressMessage,
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

const INTERNAL_RETRY_ATTEMPTS = 2;
const INTERNAL_RETRY_DELAY_MS = 1_200;

type JobProgressStage = "opening-session" | "fetching-inbox" | "retrying";

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

function waitMs(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function isRetryableJobError(error: unknown): boolean {
  return !(error instanceof MailboxExpiredError) && !(error instanceof AllowedMailboxUnavailableError);
}

function createProgressReporter(chatId: number, locale: MailJobPayload["locale"], email?: string) {
  let progressMessageId: number | undefined;

  return {
    async update(stage: JobProgressStage): Promise<void> {
      const text = buildJobProgressMessage(locale, stage, email);

      try {
        if (progressMessageId) {
          await getBot().api.editMessageText(chatId, progressMessageId, text, {
            parse_mode: "HTML"
          });
          return;
        }

        const message = await getBot().api.sendMessage(chatId, text, {
          parse_mode: "HTML"
        });
        progressMessageId = message.message_id;
      } catch (error) {
        console.warn("mail-job-progress-error", toLoggableError(error));
      }
    },
    async clear(): Promise<void> {
      if (!progressMessageId) {
        return;
      }

      await getBot().api.deleteMessage(chatId, progressMessageId).catch(() => undefined);
    }
  };
}

async function runWithInternalRetry<T>(
  payload: MailJobPayload,
  progress: ReturnType<typeof createProgressReporter>,
  operation: (attempt: number) => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= INTERNAL_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (!isRetryableJobError(error) || attempt >= INTERNAL_RETRY_ATTEMPTS) {
        throw error;
      }

      console.warn("mail-job-retry", {
        chatId: payload.chatId,
        type: payload.type,
        attempt,
        delayMs: INTERNAL_RETRY_DELAY_MS,
        error: toLoggableError(error)
      });
      await progress.update("retrying");
      await waitMs(INTERNAL_RETRY_DELAY_MS);
    }
  }

  throw new Error("Internal retry loop exited unexpectedly");
}

export async function runMailJob(payload: MailJobPayload): Promise<void> {
  const session = await getChatSession(payload.chatId);
  const locale = session.__language_code ?? payload.locale;
  const startedAt = Date.now();
  const progress = createProgressReporter(payload.chatId, locale, session.mailbox?.email);

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
      const result = await runWithInternalRetry(payload, progress, async (attempt) => {
        const state = attempt === 1 ? previousBrowserState : undefined;
        return generateMailbox(state, (stage) => progress.update(stage));
      });
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
    const refreshed = await runWithInternalRetry(payload, progress, async (attempt) => {
      const state = attempt === 1 ? browserState : undefined;
      return refreshInbox(session.mailbox!, state, (stage) => progress.update(stage));
    });
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
    await progress.clear();
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
