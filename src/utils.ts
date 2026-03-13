import { ALLOWED_MAILBOX_DOMAINS } from "./config.js";
import type { KoreaProfileSuggestion, SupportedLocale } from "./types.js";

const EMAIL_ADDRESS_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY_TIME_ZONE = "Asia/Jakarta";
const READABLE_PASSWORD_ANIMALS = [
  "Gajah",
  "Anjing",
  "Kuda",
  "Harimau",
  "Singa",
  "Kucing",
  "Burung",
  "Ular",
  "Lumba",
  "Panda",
  "Sapi",
  "Kerbau",
  "Rusa",
  "Ayam",
  "Ikan",
  "Kelinci",
  "Kangguru",
  "Elang",
  "Laba",
  "Kupu",
  "Beruang",
  "Serigala",
  "KudaNil",
  "Musang",
  "Kambing"
] as const;
const READABLE_PASSWORD_ACTIONS = [
  "Makan",
  "Minum",
  "Tidur",
  "Jalan",
  "Lari",
  "Lompat",
  "Renang",
  "Menyanyi",
  "Menari",
  "Membaca",
  "Menulis",
  "Masak",
  "Main",
  "Ngopi",
  "Belajar",
  "Bekerja",
  "Menonton",
  "Bernyanyi",
  "Berpikir",
  "Memancing",
  "Memanjat",
  "Berjalan",
  "Melukis",
  "Mengetik",
  "Bersantai"
] as const;
const READABLE_PASSWORD_FOODS = [
  "Nasi",
  "Roti",
  "Kopi",
  "Teh",
  "Susu",
  "Pisang",
  "Jeruk",
  "Apel",
  "Mangga",
  "Duren",
  "Madu",
  "Soto",
  "Bakso",
  "Sate",
  "Mie",
  "Padi",
  "Air",
  "Coklat",
  "Keju",
  "Donat",
  "Eskrim",
  "Bubur",
  "Kentang",
  "Cabe",
  "Sayur"
] as const;
const READABLE_MAILBOX_NAMES = [
  "agus",
  "andi",
  "arif",
  "bayu",
  "bima",
  "budi",
  "dedi",
  "dewi",
  "dimas",
  "dina",
  "dodi",
  "doni",
  "eka",
  "eko",
  "esti",
  "fajar",
  "faisal",
  "farhan",
  "gina",
  "gita",
  "guntur",
  "hadi",
  "hasan",
  "hendra",
  "indah",
  "irfan",
  "joko",
  "kartika",
  "kiki",
  "laras",
  "lina",
  "lisa",
  "lukman",
  "maya",
  "mira",
  "nanda",
  "nita",
  "putri",
  "rama",
  "rani",
  "reza",
  "rina",
  "rudi",
  "sari",
  "sinta",
  "siti",
  "slamet",
  "susi",
  "tia",
  "toni",
  "tono",
  "vina",
  "wati",
  "wira",
  "yuni",
  "yusuf"
] as const;
const READABLE_MAILBOX_WORDS = [
  "air",
  "almari",
  "baju",
  "bantal",
  "buku",
  "celana",
  "ember",
  "garam",
  "garpu",
  "gelas",
  "gula",
  "handuk",
  "jam",
  "jendela",
  "jeruk",
  "kertas",
  "kasur",
  "keyboard",
  "keset",
  "kipas",
  "komputer",
  "kunci",
  "kursi",
  "lampu",
  "lemari",
  "meja",
  "minyak",
  "monitor",
  "mouse",
  "nasi",
  "payung",
  "pel",
  "pensil",
  "piring",
  "pintu",
  "pisau",
  "printer",
  "pulpen",
  "radio",
  "roti",
  "sabun",
  "sapu",
  "selimut",
  "sendok",
  "sepatu",
  "sikat",
  "tas",
  "telepon",
  "televisi"
] as const;
const READABLE_MAILBOX_CITIES = [
  "ambon",
  "balikpapan",
  "bandung",
  "bangkalan",
  "banjarmasin",
  "banyuwangi",
  "bengkulu",
  "bitung",
  "blitar",
  "bondowoso",
  "bukittinggi",
  "denpasar",
  "gorontalo",
  "jakarta",
  "jambi",
  "jayapura",
  "jember",
  "kediri",
  "kendari",
  "kupang",
  "lumajang",
  "makassar",
  "malang",
  "madiun",
  "manado",
  "mataram",
  "medan",
  "mojokerto",
  "padang",
  "palembang",
  "palu",
  "pamekasan",
  "pasuruan",
  "payakumbuh",
  "pekanbaru",
  "pontianak",
  "probolinggo",
  "samarinda",
  "sampang",
  "semarang",
  "solo",
  "sorong",
  "situbondo",
  "sumenep",
  "surabaya",
  "tarakan",
  "ternate",
  "tidore",
  "yogyakarta"
] as const;
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
  const suffix = randomBetween(0, 99).toString();
  return `${pickRandom(READABLE_PASSWORD_ANIMALS)}${pickRandom(READABLE_PASSWORD_ACTIONS)}${pickRandom(READABLE_PASSWORD_FOODS)}${suffix}`;
}

export function buildReadableMailboxLocalPart(): string {
  const person = pickRandom(READABLE_MAILBOX_NAMES);
  const word = pickRandom(READABLE_MAILBOX_WORDS);
  const city = pickRandom(READABLE_MAILBOX_CITIES);
  const number = randomBetween(0, 99).toString();
  return `${person}${word}${city}${number}`;
}

export function buildReadableMailboxEmail(domains: readonly string[]): string {
  return `${buildReadableMailboxLocalPart()}@${pickRandom(domains)}`;
}

export function buildRecommendedName(): string {
  return buildKoreanName();
}

export function buildKoreanName(): string {
  return `${pickRandom(KOREAN_LAST_NAMES)} ${pickRandom(KOREAN_GIVEN_NAMES)}`;
}

export function buildKoreanProfile(): KoreaProfileSuggestion {
  const region = pickRandom(KOREAN_REGIONS);
  const road = pickRandom(region.roads);
  const postalCode = pickRandom(region.postalCodes);
  const buildingNumber = randomBetween(11, 187);
  const unit = randomBetween(2, 28);
  const floor = randomBetween(1, 24);

  return {
    fullName: buildKoreanName(),
    birthDate: buildAdultBirthDate(25, 39),
    addressLine: `${buildingNumber} ${road}, ${floor}-${unit}`,
    city: region.city,
    district: region.district,
    postalCode
  };
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

  void locale;
  return `${day.toString().padStart(2, "0")}-${month.toString().padStart(2, "0")}-${year.toString().padStart(4, "0")}`;
}

export function formatDateTime(value: string, locale: SupportedLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const formatted = date.toLocaleString(locale === "id" ? "id-ID" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DISPLAY_TIME_ZONE
  });

  return `${formatted} WIB`;
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

export function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmailAddress(value: string): boolean {
  return EMAIL_ADDRESS_REGEX.test(normalizeEmailAddress(value));
}

export function isAllowedMailboxDomain(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return ALLOWED_MAILBOX_DOMAINS.includes(normalized as typeof ALLOWED_MAILBOX_DOMAINS[number]);
}

export function isAllowedMailboxEmail(value: string): boolean {
  return isAllowedMailboxDomain(extractDomain(normalizeEmailAddress(value)));
}

export function generateLuhnCard(bin: string, length = 16): string {
  let numberString = bin;
  while (numberString.length < length - 1) {
    numberString += randomBetween(0, 9).toString();
  }

  let sum = 0;
  let isEven = true;
  for (let i = numberString.length - 1; i >= 0; i--) {
    let digit = parseInt(numberString.charAt(i), 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    isEven = !isEven;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return numberString + checkDigit.toString();
}

export function generateVirtualCards(bin: string, count: number) {
  const cards = [];
  const currentYear = new Date().getFullYear();

  for (let i = 0; i < count; i++) {
    const number = generateLuhnCard(bin);
    // Expiry: Random month (01-12) and random year (current + 2 to +4 years)
    const month = randomBetween(1, 12).toString().padStart(2, "0");
    const year = randomBetween(currentYear + 2, currentYear + 4).toString();
    const expiry = `${month}/${year}`;
    // CVV: 3 random digits
    const cvv = randomBetween(100, 999).toString();

    cards.push({ number, expiry, cvv });
  }
  return cards;
}
