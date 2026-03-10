import type { KoreaProfileSuggestion, SupportedLocale } from "./types.js";

const EASY_CONSONANTS = ["b", "c", "d", "f", "g", "h", "j", "k", "l", "m", "n", "p", "r", "s", "t", "v", "w", "z"] as const;
const EASY_VOWELS = ["a", "e", "i", "o", "u"] as const;
const EASY_DIGITS = ["2", "3", "4", "5", "6", "7", "8", "9"] as const;
const KOREAN_LAST_NAMES = ["Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon", "Jang", "Lim"] as const;
const KOREAN_GIVEN_NAMES = [
  "Minseo",
  "Jiwoo",
  "Seoyeon",
  "Haneul",
  "Yuna",
  "Sujin",
  "Jisoo",
  "Minji",
  "Jiho",
  "Minho",
  "Hyunwoo",
  "Seojun",
  "Taeyang",
  "Donghyun",
  "Jiwon",
  "Eunji"
] as const;
const KOREAN_REGIONS = [
  {
    city: "Seoul",
    district: "Gangnam-gu",
    roads: ["Teheran-ro", "Bongeunsa-ro", "Dosan-daero"],
    postalCodes: ["06164", "06040", "06028"]
  },
  {
    city: "Seoul",
    district: "Mapo-gu",
    roads: ["World Cup buk-ro", "Yanghwa-ro", "Donggyo-ro"],
    postalCodes: ["03995", "04036", "03985"]
  },
  {
    city: "Busan",
    district: "Haeundae-gu",
    roads: ["Haeundaehaebyeon-ro", "Centum nam-daero", "Apec-ro"],
    postalCodes: ["48094", "48060", "48058"]
  },
  {
    city: "Incheon",
    district: "Yeonsu-gu",
    roads: ["Convensia-daero", "Songdo gwahak-ro", "Harmony-ro"],
    postalCodes: ["21998", "21984", "22002"]
  },
  {
    city: "Daegu",
    district: "Suseong-gu",
    roads: ["Dongdaegu-ro", "Beomeo-cheon-ro", "Cheongsu-ro"],
    postalCodes: ["42117", "42088", "42175"]
  },
  {
    city: "Daejeon",
    district: "Yuseong-gu",
    roads: ["Expo-ro", "Daedeok-daero", "Techno jungang-ro"],
    postalCodes: ["34125", "34141", "34014"]
  },
  {
    city: "Gwangju",
    district: "Seo-gu",
    roads: ["Sangmu-daero", "Geumnam-ro", "Mudeung-ro"],
    postalCodes: ["61963", "61949", "61918"]
  },
  {
    city: "Suwon",
    district: "Yeongtong-gu",
    roads: ["Gwanggyo jungang-ro", "Deogyeong-daero", "Bandal-ro"],
    postalCodes: ["16514", "16676", "16704"]
  }
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
  return buildKoreanName();
}

export function buildKoreanName(): string {
  return `${pickRandom(KOREAN_LAST_NAMES)} ${pickRandom(KOREAN_GIVEN_NAMES)}`;
}

export function buildKoreanProfiles(count = 5): KoreaProfileSuggestion[] {
  const profiles: KoreaProfileSuggestion[] = [];
  const usedKeys = new Set<string>();

  while (profiles.length < count) {
    const region = pickRandom(KOREAN_REGIONS);
    const road = pickRandom(region.roads);
    const postalCode = pickRandom(region.postalCodes);
    const buildingNumber = randomBetween(11, 187);
    const unit = randomBetween(2, 28);
    const floor = randomBetween(1, 24);
    const profile: KoreaProfileSuggestion = {
      fullName: buildKoreanName(),
      birthDate: buildAdultBirthDate(25, 39),
      addressLine: `${buildingNumber} ${road}, ${floor}-${unit}`,
      city: region.city,
      district: region.district,
      postalCode
    };
    const key = `${profile.fullName}:${profile.addressLine}:${profile.postalCode}`;

    if (usedKeys.has(key)) {
      continue;
    }

    usedKeys.add(key);
    profiles.push(profile);
  }

  return profiles;
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
