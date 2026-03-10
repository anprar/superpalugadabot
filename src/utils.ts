import type { SupportedLocale } from "./types.js";

const EASY_CONSONANTS = ["b", "c", "d", "f", "g", "h", "j", "k", "l", "m", "n", "p", "r", "s", "t", "v", "w", "z"] as const;
const EASY_VOWELS = ["a", "e", "i", "o", "u"] as const;
const EASY_DIGITS = ["2", "3", "4", "5", "6", "7", "8", "9"] as const;
const FIRST_NAMES = [
  "Alya",
  "Raka",
  "Nadia",
  "Dimas",
  "Sinta",
  "Rizky",
  "Nabila",
  "Farhan",
  "Aurel",
  "Rafli",
  "Kayla",
  "Fikri",
  "Tiara",
  "Bagas",
  "Nadira",
  "Galih",
  "Citra",
  "Arkan",
  "Naura",
  "Vino"
] as const;
const LAST_NAMES = [
  "Pratama",
  "Saputra",
  "Wijaya",
  "Mahesa",
  "Lestari",
  "Permata",
  "Ramadhan",
  "Anjani",
  "Putri",
  "Kusuma",
  "Firmansyah",
  "Wibowo",
  "Pangestu",
  "Maharani",
  "Nugraha",
  "Adriansyah",
  "Cahyani",
  "Utami",
  "Iskandar",
  "Maulana"
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
  const buildWord = (): string => {
    const word = [
      pickRandom(EASY_CONSONANTS),
      pickRandom(EASY_VOWELS),
      pickRandom(EASY_CONSONANTS),
      pickRandom(EASY_VOWELS),
      pickRandom(EASY_CONSONANTS)
    ].join("");

    return word.charAt(0).toUpperCase() + word.slice(1);
  };

  const digits = `${pickRandom(EASY_DIGITS)}${pickRandom(EASY_DIGITS)}`;
  return `${buildWord()}${buildWord()}${digits}`;
}

export function buildRecommendedName(): string {
  const firstName = pickRandom(FIRST_NAMES);
  const lastName = pickRandom(LAST_NAMES);

  return `${firstName} ${lastName}`;
}

export function buildAdultBirthDate(minAge = 25, maxAge = 39): string {
  const today = new Date();
  const latest = new Date(Date.UTC(today.getUTCFullYear() - minAge, today.getUTCMonth(), today.getUTCDate()));
  const earliest = new Date(Date.UTC(today.getUTCFullYear() - maxAge, today.getUTCMonth(), today.getUTCDate()));
  const span = latest.getTime() - earliest.getTime();
  const selected = new Date(earliest.getTime() + Math.floor(Math.random() * (span + 1)));

  return selected.toISOString().slice(0, 10);
}

export function getAgeYears(birthDate: string): number {
  const [yearText, monthText, dayText] = birthDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || !month || !day) {
    return 0;
  }

  const today = new Date();
  let age = today.getUTCFullYear() - year;
  const monthDelta = today.getUTCMonth() + 1 - month;
  const dayDelta = today.getUTCDate() - day;

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }

  return age;
}

export function formatBirthDate(value: string, locale: SupportedLocale): string {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || !month || !day) {
    return value;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  });
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
