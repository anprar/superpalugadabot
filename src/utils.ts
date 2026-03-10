import type { SupportedLocale } from "./types.js";

const PASSWORD_PHRASES = [
  ["Pagi", "ini", "cerah"],
  ["Kopi", "hangat", "manis"],
  ["Langit", "biru", "jernih"],
  ["Teh", "pagi", "tenang"],
  ["Roti", "pagi", "gurih"],
  ["Senja", "sore", "teduh"],
  ["Bulan", "malam", "lembut"],
  ["Hujan", "pagi", "sejuk"],
  ["Bintang", "malam", "hening"],
  ["Taman", "hijau", "damai"]
] as const;

export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const duration = randomBetween(minMs, maxMs);
  await new Promise((resolve) => setTimeout(resolve, duration));
}

export function pickRandom<T>(items: readonly T[]): T {
  return items[randomBetween(0, items.length - 1)] as T;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildReadablePassword(): string {
  const phrase = pickRandom(PASSWORD_PHRASES)
    .map((part, index) => {
      const normalized = part.toLowerCase();
      return index === 0
        ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
        : normalized;
    })
    .join("");

  return `${phrase}.${randomBetween(1, 9)}`;
}

export function formatDateTime(value: string, locale: SupportedLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(locale === "id" ? "id-ID" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function trimPreview(value: string, maxLength = 72): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

export function normalizeLine(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

export function extractDomain(email: string): string {
  const [, domain = ""] = email.split("@");
  return domain.toLowerCase();
}
