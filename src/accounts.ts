import {
  ADMIN_CONTACT_USERNAME,
  ADMIN_USERNAME,
  MAX_MAILBOX_HISTORY_ITEMS,
  PAID_MAILBOX_HISTORY_ITEMS,
  PAID_SUBSCRIPTION_DAYS,
  PAID_SUBSCRIPTION_REMINDER_DAYS,
  SPECIAL_ADMIN_HISTORY_ITEMS
} from "./config.js";
import { getRedisClient } from "./sessions.js";
import type { AccountPlan, UserAccount } from "./types.js";

const ACCOUNT_PREFIX = "mt:account:";
const ACCOUNT_INDEX_KEY = "mt:accounts:index";

export interface AccountIdentity {
  userId: number;
  chatId: number;
  username?: string;
  firstName?: string;
}

function accountKey(userId: number): string {
  return `${ACCOUNT_PREFIX}${userId}`;
}

function normalizeUsername(username?: string): string | undefined {
  return username?.trim().toLowerCase() || undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

function addDays(value: string, days: number): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function isAdminAccount(username?: string): boolean {
  return normalizeUsername(username) === ADMIN_USERNAME;
}

function isSpecialAdminAccount(username?: string): boolean {
  return isAdminAccount(username);
}

function buildDefaultAccount(identity: AccountIdentity, createdAt = nowIso()): UserAccount {
  if (isSpecialAdminAccount(identity.username)) {
    return {
      userId: identity.userId,
      chatId: identity.chatId,
      username: identity.username,
      firstName: identity.firstName,
      plan: "custom",
      historyLimit: SPECIAL_ADMIN_HISTORY_ITEMS,
      createdAt,
      updatedAt: createdAt,
      startedAt: createdAt
    };
  }

  return {
    userId: identity.userId,
    chatId: identity.chatId,
    username: identity.username,
    firstName: identity.firstName,
    plan: "free",
    historyLimit: MAX_MAILBOX_HISTORY_ITEMS,
    createdAt,
    updatedAt: createdAt
  };
}

function reconcileAccount(account: UserAccount, identity?: Partial<AccountIdentity>): UserAccount {
  const next = {
    ...account,
    chatId: identity?.chatId ?? account.chatId,
    username: identity?.username ?? account.username,
    firstName: identity?.firstName ?? account.firstName
  };

  if (isSpecialAdminAccount(next.username)) {
    return {
      ...next,
      plan: "custom",
      historyLimit: SPECIAL_ADMIN_HISTORY_ITEMS,
      startedAt: next.startedAt ?? next.createdAt,
      expiresAt: undefined,
      reminderSentAt: undefined
    };
  }

  if (next.plan === "paid" && next.expiresAt) {
    const expiresAt = new Date(next.expiresAt).getTime();
    if (!Number.isNaN(expiresAt) && expiresAt <= Date.now()) {
      return {
        ...next,
        plan: "free",
        historyLimit: MAX_MAILBOX_HISTORY_ITEMS,
        expiresAt: undefined,
        reminderSentAt: undefined
      };
    }
  }

  if (next.plan === "free") {
    return {
      ...next,
      historyLimit: MAX_MAILBOX_HISTORY_ITEMS,
      expiresAt: undefined,
      reminderSentAt: undefined
    };
  }

  if (next.plan === "paid") {
    return {
      ...next,
      historyLimit: PAID_MAILBOX_HISTORY_ITEMS
    };
  }

  return next;
}

async function saveAccount(account: UserAccount): Promise<UserAccount> {
  await getRedisClient().set(accountKey(account.userId), account);
  await getRedisClient().sadd(ACCOUNT_INDEX_KEY, account.userId.toString());
  return account;
}

export async function getUserAccount(identity: AccountIdentity): Promise<UserAccount> {
  const existing = await getRedisClient().get<UserAccount>(accountKey(identity.userId));
  const base = existing ?? buildDefaultAccount(identity);
  const next = reconcileAccount(base, identity);

  if (!existing || JSON.stringify(existing) !== JSON.stringify(next)) {
    next.updatedAt = nowIso();
    await saveAccount(next);
  }

  return next;
}

export async function getUserAccountById(userId: number, chatId = userId): Promise<UserAccount> {
  return getUserAccount({ userId, chatId });
}

export async function listTrackedAccounts(): Promise<UserAccount[]> {
  const ids = await getRedisClient().smembers<string[]>(ACCOUNT_INDEX_KEY);
  const uniqueIds = Array.from(new Set((ids ?? []).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)));
  const accounts = await Promise.all(uniqueIds.map((userId) => getUserAccountById(userId)));
  return accounts;
}

export async function setUserPlan(options: {
  userId: number;
  chatId?: number;
  username?: string;
  firstName?: string;
  plan: AccountPlan;
  customHistoryLimit?: number;
}): Promise<UserAccount> {
  const existing = await getUserAccount({
    userId: options.userId,
    chatId: options.chatId ?? options.userId,
    username: options.username,
    firstName: options.firstName
  });
  const updatedAt = nowIso();

  let next: UserAccount;
  if (options.plan === "free") {
    next = {
      ...existing,
      plan: "free",
      historyLimit: MAX_MAILBOX_HISTORY_ITEMS,
      updatedAt,
      startedAt: undefined,
      expiresAt: undefined,
      reminderSentAt: undefined
    };
  } else if (options.plan === "paid") {
    next = {
      ...existing,
      plan: "paid",
      historyLimit: PAID_MAILBOX_HISTORY_ITEMS,
      updatedAt,
      startedAt: updatedAt,
      expiresAt: addDays(updatedAt, PAID_SUBSCRIPTION_DAYS),
      reminderSentAt: undefined
    };
  } else {
    const historyLimit = Math.max(MAX_MAILBOX_HISTORY_ITEMS, Math.min(options.customHistoryLimit ?? SPECIAL_ADMIN_HISTORY_ITEMS, 500));
    next = {
      ...existing,
      plan: "custom",
      historyLimit,
      updatedAt,
      startedAt: existing.startedAt ?? updatedAt,
      expiresAt: undefined,
      reminderSentAt: undefined
    };
  }

  const reconciled = reconcileAccount(next, {
    chatId: options.chatId ?? existing.chatId,
    username: options.username ?? existing.username,
    firstName: options.firstName ?? existing.firstName
  });
  return saveAccount(reconciled);
}

export async function markReminderSent(userId: number, sentAt = nowIso()): Promise<UserAccount> {
  const existing = await getUserAccountById(userId);
  const next = {
    ...existing,
    reminderSentAt: sentAt,
    updatedAt: sentAt
  };
  return saveAccount(next);
}

export function isReminderDue(account: UserAccount, now = Date.now()): boolean {
  if (account.plan !== "paid" || !account.expiresAt) {
    return false;
  }

  const expiresAt = new Date(account.expiresAt).getTime();
  if (Number.isNaN(expiresAt) || expiresAt <= now) {
    return false;
  }

  const remainingMs = expiresAt - now;
  const reminderWindowMs = PAID_SUBSCRIPTION_REMINDER_DAYS * 24 * 60 * 60 * 1000;
  if (remainingMs > reminderWindowMs) {
    return false;
  }

  if (!account.reminderSentAt) {
    return true;
  }

  return new Date(account.reminderSentAt).getTime() < new Date(account.startedAt ?? account.createdAt).getTime();
}

export function isExpiredPaidAccount(account: UserAccount, now = Date.now()): boolean {
  if (account.plan !== "paid" || !account.expiresAt) {
    return false;
  }

  const expiresAt = new Date(account.expiresAt).getTime();
  return !Number.isNaN(expiresAt) && expiresAt <= now;
}

export async function downgradeExpiredAccount(userId: number): Promise<UserAccount> {
  return setUserPlan({ userId, plan: "free" });
}

export function getPlanLabel(plan: AccountPlan): string {
  return plan;
}

export function getAdminContact(): string {
  return ADMIN_CONTACT_USERNAME;
}
