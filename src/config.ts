import type { ActionPolicy, SupportedLocale } from "./types.js";

export const MAILTICKING_URL = "https://www.mailticking.com/";
export const FREE_HISTORY_RETENTION_DAYS = 30;
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
export const MAX_INBOX_ITEMS = 10;
export const MAX_MAILBOX_HISTORY_ITEMS = 8;
export const PAID_MAILBOX_HISTORY_ITEMS = 50;
export const PAID_SUBSCRIPTION_PRICE_IDR = 10_000;
export const PAID_SUBSCRIPTION_DAYS = 30;
export const PAID_SUBSCRIPTION_REMINDER_DAYS = 7;
export const ADMIN_CONTACT_USERNAME = "@AndiPradanaAr";
export const ADMIN_USERNAME = "andipradanaar";
export const SPECIAL_ADMIN_HISTORY_ITEMS = 100;
export const MAX_PUBLIC_MAILBOX_ATTEMPTS = 24;
export const PLAYWRIGHT_DEFAULT_TIMEOUT_MS = 45_000;
export const PLAYWRIGHT_NAVIGATION_TIMEOUT_MS = 55_000;
export const ALLOWED_MAILBOX_DOMAINS = [
  "rulersonline.com",
  "mediaeast.uk",
  "mediaholy.com",
  "incart.com",
  "justdefinition.com",
  "gongjua.com",
  "123mails.org"
] as const;

export const ACTION_POLICIES: Record<string, ActionPolicy> = {
  generate: {
    limit: 2,
    windowSeconds: 60,
    lockSeconds: 120
  },
  refresh: {
    limit: 6,
    windowSeconds: 60,
    lockSeconds: 90
  },
  inbox: {
    limit: 12,
    windowSeconds: 60,
    lockSeconds: 20
  }
};

function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getRequiredEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function getBotToken(): string {
  return getRequiredEnv("BOT_TOKEN");
}

export function getWebhookSecret(): string | undefined {
  return getEnv("WEBHOOK_SECRET");
}

export function getCronSecret(): string | undefined {
  return getEnv("CRON_SECRET");
}

export function getPublicBaseUrl(): string {
  const explicit = getEnv("APP_BASE_URL");
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  const vercelProductionUrl = getEnv("VERCEL_PROJECT_PRODUCTION_URL");
  if (vercelProductionUrl) {
    return `https://${vercelProductionUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  }

  const vercelUrl = getEnv("VERCEL_URL");
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  }

  throw new Error("APP_BASE_URL or VERCEL_URL is required for QStash job routing");
}

export function getProxyUrls(): string[] {
  const envValue = getEnv("PROXY_URL");
  if (!envValue) {
    return [];
  }
  return envValue.split(",").map(p => p.trim()).filter(Boolean);
}

export function getRedisConfig(): { url: string; token: string } {
  return {
    url: getRequiredEnv("UPSTASH_REDIS_REST_URL"),
    token: getRequiredEnv("UPSTASH_REDIS_REST_TOKEN")
  };
}

export function getQStashConfig(): {
  token: string;
  currentSigningKey: string;
  nextSigningKey: string;
} {
  return {
    token: getRequiredEnv("QSTASH_TOKEN"),
    currentSigningKey: getRequiredEnv("QSTASH_CURRENT_SIGNING_KEY"),
    nextSigningKey: getRequiredEnv("QSTASH_NEXT_SIGNING_KEY")
  };
}

export function getSupportedLocale(value?: string): SupportedLocale {
  if (!value) {
    return "id";
  }

  return value.toLowerCase().startsWith("en") ? "en" : "id";
}
