import { Redis } from "@upstash/redis";
import type { StorageAdapter } from "grammy";
import type { BotSessionData, InboxCache, MailJobType, MailboxSession } from "./types.js";
import { getRedisConfig, MAX_MAILBOX_HISTORY_ITEMS, SESSION_TTL_SECONDS } from "./config.js";

const SESSION_PREFIX = "mt:session:";
const BROWSER_PREFIX = "mt:browser:";
const ACTION_PREFIX = "mt:action:";
const LOCK_PREFIX = "mt:lock:";

let redisClient: Redis | undefined;

export function getRedisClient(): Redis {
  if (!redisClient) {
    const config = getRedisConfig();
    redisClient = new Redis({
      url: config.url,
      token: config.token
    });
  }

  return redisClient;
}

function sessionKey(chatId: number | string): string {
  return `${SESSION_PREFIX}${chatId}`;
}

function browserKey(chatId: number | string): string {
  return `${BROWSER_PREFIX}${chatId}`;
}

function actionKey(chatId: number | string, action: string, bucket: number): string {
  return `${ACTION_PREFIX}${chatId}:${action}:${bucket}`;
}

function lockKey(chatId: number | string, action: MailJobType): string {
  return `${LOCK_PREFIX}${chatId}:${action}`;
}

export function createInitialSessionData(): BotSessionData {
  return {};
}

export function createSessionStorage(): StorageAdapter<BotSessionData> {
  return {
    read: async (key) => {
      const data = await getRedisClient().get<BotSessionData>(sessionKey(key));
      return data ?? undefined;
    },
    write: async (key, value) => {
      if (value === undefined) {
        await getRedisClient().del(sessionKey(key));
        return;
      }

      await getRedisClient().set(sessionKey(key), value, { ex: SESSION_TTL_SECONDS });
    },
    delete: async (key) => {
      await getRedisClient().del(sessionKey(key));
    }
  };
}

export async function getChatSession(chatId: number): Promise<BotSessionData> {
  const session = await getRedisClient().get<BotSessionData>(sessionKey(chatId));
  return session ?? createInitialSessionData();
}

export async function saveChatSession(chatId: number, data: BotSessionData): Promise<void> {
  await getRedisClient().set(sessionKey(chatId), data, { ex: SESSION_TTL_SECONDS });
}

export async function patchChatSession(
  chatId: number,
  updater: (current: BotSessionData) => BotSessionData
): Promise<BotSessionData> {
  const current = await getChatSession(chatId);
  const next = updater(current);
  await saveChatSession(chatId, next);
  return next;
}

export async function saveBrowserState(chatId: number, storageState: unknown): Promise<void> {
  await getRedisClient().set(browserKey(chatId), storageState, { ex: SESSION_TTL_SECONDS });
}

export async function clearBrowserState(chatId: number): Promise<void> {
  await getRedisClient().del(browserKey(chatId));
}

export async function getBrowserState<T>(chatId: number): Promise<T | undefined> {
  const state = await getRedisClient().get<T>(browserKey(chatId));
  return state ?? undefined;
}

export async function clearMailboxState(chatId: number): Promise<void> {
  await clearBrowserState(chatId);
  await patchChatSession(chatId, (current) => ({
    ...current,
    mailbox: undefined,
    inboxCache: undefined,
    pendingJob: undefined
  }));
}

export async function storeInboxCache(chatId: number, inboxCache: InboxCache): Promise<void> {
  await patchChatSession(chatId, (current) => ({
    ...current,
    inboxCache
  }));
}

export async function tryAcquireJobLock(chatId: number, action: MailJobType, ttlSeconds: number): Promise<boolean> {
  const result = await getRedisClient().set(lockKey(chatId, action), Date.now().toString(), {
    nx: true,
    ex: ttlSeconds
  });

  return result === "OK";
}

export async function releaseJobLock(chatId: number, action: MailJobType): Promise<void> {
  await getRedisClient().del(lockKey(chatId, action));
}

export async function consumeActionQuota(
  chatId: number,
  action: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = actionKey(chatId, action, bucket);
  const count = await getRedisClient().incr(key);

  if (count === 1) {
    await getRedisClient().expire(key, windowSeconds + 5);
  }

  const retryAfterSeconds = windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds);
  return {
    allowed: count <= limit,
    retryAfterSeconds
  };
}

export function mergeMailboxHistory(
  history: MailboxSession[] | undefined,
  mailbox: MailboxSession,
  limit = MAX_MAILBOX_HISTORY_ITEMS
): MailboxSession[] {
  const nextHistory = [mailbox, ...(history ?? []).filter((item) => item.email !== mailbox.email)];
  return nextHistory.slice(0, limit);
}

export function trimMailboxHistory(
  history: MailboxSession[] | undefined,
  currentMailbox: MailboxSession | undefined,
  limit = MAX_MAILBOX_HISTORY_ITEMS
): MailboxSession[] {
  if (currentMailbox) {
    return mergeMailboxHistory(history, currentMailbox, limit);
  }

  return (history ?? []).slice(0, limit);
}

export async function enforceMailboxHistoryLimit(chatId: number, limit: number): Promise<BotSessionData> {
  return patchChatSession(chatId, (current) => ({
    ...current,
    mailboxHistory: trimMailboxHistory(current.mailboxHistory, current.mailbox, limit)
  }));
}

export function findMailboxInHistory(
  history: MailboxSession[] | undefined,
  email: string
): MailboxSession | undefined {
  return (history ?? []).find((item) => item.email === email);
}
