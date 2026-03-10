import { InlineKeyboard } from "grammy";
import type { MailboxSession, SupportedLocale } from "./types.js";

const LABELS: Record<SupportedLocale, Record<string, string>> = {
  id: {
    generate: "Generate Email",
    regenerate: "Regenerate",
    refresh: "Refresh Inbox",
    inbox: "Lihat Inbox",
    history: "Riwayat Email",
    restore: "Restore",
    delete: "Hapus",
    current: "Aktif",
    language: "Bahasa",
    back: "Kembali",
    id: "Indonesia",
    en: "English",
    processing: "⏳ Sedang diproses..."
  },
  en: {
    generate: "Generate Email",
    regenerate: "Regenerate",
    refresh: "Refresh Inbox",
    inbox: "View Inbox",
    history: "Email History",
    restore: "Restore",
    delete: "Delete",
    current: "Current",
    language: "Language",
    back: "Back",
    id: "Indonesia",
    en: "English",
    processing: "⏳ Processing..."
  }
};

function label(locale: SupportedLocale, key: string): string {
  return LABELS[locale][key];
}

function shortenEmail(email: string, maxLength = 28): string {
  if (email.length <= maxLength) {
    return email;
  }

  return `${email.slice(0, maxLength - 3)}...`;
}

export function buildMainMenuKeyboard(locale: SupportedLocale, hasMailbox: boolean, hasHistory = hasMailbox): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  keyboard.text(label(locale, hasMailbox ? "regenerate" : "generate"), "mt:generate");

  if (hasMailbox) {
    keyboard.text(label(locale, "refresh"), "mt:refresh").row();
    keyboard.text(label(locale, "inbox"), "mt:inbox");
  }

  if (hasHistory) {
    if (hasMailbox) {
      keyboard.text(label(locale, "history"), "mt:history");
    } else {
      keyboard.row().text(label(locale, "history"), "mt:history");
    }
  }

  keyboard.row().text(label(locale, "language"), "mt:lang:open");
  return keyboard;
}

export function buildProcessingKeyboard(locale: SupportedLocale): InlineKeyboard {
  return new InlineKeyboard()
    .text(label(locale, "processing"), "mt:noop");
}

export function buildLanguageKeyboard(locale: SupportedLocale): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${locale === "id" ? "• " : ""}${label(locale, "id")}`, "mt:lang:set:id")
    .text(`${locale === "en" ? "• " : ""}${label(locale, "en")}`, "mt:lang:set:en")
    .row()
    .text(label(locale, "back"), "mt:menu");
}

export function buildHistoryKeyboard(
  locale: SupportedLocale,
  history: MailboxSession[],
  currentEmail?: string
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  history.forEach((mailbox, index) => {
    const prefix = mailbox.email === currentEmail ? "• " : "";
    const title = `${prefix}${shortenEmail(mailbox.email)}`;

    if (mailbox.email === currentEmail) {
      keyboard.text(title, "mt:noop").text(label(locale, "current"), "mt:noop").row();
      return;
    }

    keyboard
      .text(title, `mt:restore:i:${index}`)
      .text(label(locale, "delete"), `mt:delete:i:${index}`)
      .row();
  });

  keyboard.text(label(locale, "back"), "mt:menu");
  return keyboard;
}
