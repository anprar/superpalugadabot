import { InlineKeyboard } from "grammy";
import type { SupportedLocale } from "./types.js";

const LABELS: Record<SupportedLocale, Record<string, string>> = {
  id: {
    generate: "Generate Email",
    regenerate: "Regenerate",
    refresh: "Refresh Inbox",
    inbox: "Lihat Inbox",
    language: "Bahasa",
    back: "Kembali",
    id: "Indonesia",
    en: "English"
  },
  en: {
    generate: "Generate Email",
    regenerate: "Regenerate",
    refresh: "Refresh Inbox",
    inbox: "View Inbox",
    language: "Language",
    back: "Back",
    id: "Indonesia",
    en: "English"
  }
};

function label(locale: SupportedLocale, key: string): string {
  return LABELS[locale][key];
}

export function buildMainMenuKeyboard(locale: SupportedLocale, hasMailbox: boolean): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  keyboard.text(label(locale, hasMailbox ? "regenerate" : "generate"), "mt:generate");

  if (hasMailbox) {
    keyboard.text(label(locale, "refresh"), "mt:refresh").row();
    keyboard.text(label(locale, "inbox"), "mt:inbox");
  }

  keyboard.row().text(label(locale, "language"), "mt:lang:open");
  return keyboard;
}

export function buildLanguageKeyboard(locale: SupportedLocale): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${locale === "id" ? "• " : ""}${label(locale, "id")}`, "mt:lang:set:id")
    .text(`${locale === "en" ? "• " : ""}${label(locale, "en")}`, "mt:lang:set:en")
    .row()
    .text(label(locale, "back"), "mt:menu");
}
