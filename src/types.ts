import type { I18nFlavor } from "@grammyjs/i18n";
import type { Context, SessionFlavor } from "grammy";
import type { BrowserContext } from "playwright-core";

export type SupportedLocale = "id" | "en";
export type MailJobType = "generate" | "refresh";
export type InboxSource = "dom" | "json" | "mixed";
export type BrowserStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

export interface InboxItem {
  id: string;
  sender: string;
  subject: string;
  preview: string;
  receivedAt?: string;
  detailUrl?: string;
  isUnread?: boolean;
}

export interface InboxCache {
  items: InboxItem[];
  refreshedAt: string;
  source: InboxSource;
}

export interface IdentitySuggestion {
  fullName: string;
  birthDate: string;
}

export interface MailboxSession {
  email: string;
  code: string;
  domain: string;
  password: string;
  identity: IdentitySuggestion;
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface PendingJobState {
  id: string;
  type: MailJobType;
  requestedAt: string;
}

export interface Phase2SurveyTask {
  url?: string;
  proxyRegion?: string;
  captchaProvider?: "2captcha" | "hcaptcha";
  fakerProfileEnabled?: boolean;
}

export interface BotSessionData {
  __language_code?: SupportedLocale;
  mailbox?: MailboxSession;
  inboxCache?: InboxCache;
  pendingJob?: PendingJobState;
  phase2?: Phase2SurveyTask;
}

export interface MailJobPayload {
  chatId: number;
  userId?: number;
  locale: SupportedLocale;
  type: MailJobType;
  requestedAt: string;
}

export interface ScraperMailboxResult {
  mailbox: MailboxSession;
  inboxCache?: InboxCache;
  storageState: BrowserStorageState;
}

export interface ScraperRefreshResult {
  mailbox: MailboxSession;
  inboxCache: InboxCache;
  storageState: BrowserStorageState;
}

export interface ProxySettings {
  server: string;
  username?: string;
  password?: string;
}

export interface ActionPolicy {
  limit: number;
  windowSeconds: number;
  lockSeconds: number;
}

export type BotContext = Context & SessionFlavor<BotSessionData> & I18nFlavor;
