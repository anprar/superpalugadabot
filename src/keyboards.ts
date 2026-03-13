import { InlineKeyboard } from "grammy";
import { ADMIN_CONTACT_USERNAME, PAID_SUBSCRIPTION_DAYS, PAID_SUBSCRIPTION_PRICE_IDR } from "./config.js";
import type { MailboxSession, SupportedLocale } from "./types.js";

const LABELS: Record<SupportedLocale, Record<string, string>> = {
  id: {
    generate: "Generate Email",
    regenerate: "Regenerate",
    import: "Input Email",
    addNote: "Tambah Catatan",
    editNote: "Ubah Catatan",
    deleteNote: "Hapus Catatan",
    resetSession: "Reset Session",
    refresh: "Refresh Inbox",
    inbox: "Lihat Inbox",
    history: "Riwayat Email",
    subscription: "Subscription",
    contactAdmin: "Chat Admin",
    copyMessage: "Salin Pesan",
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
    import: "Add Email",
    addNote: "Add Note",
    editNote: "Edit Note",
    deleteNote: "Delete Note",
    resetSession: "Reset Session",
    refresh: "Refresh Inbox",
    inbox: "View Inbox",
    history: "Email History",
    subscription: "Subscription",
    contactAdmin: "Chat Admin",
    copyMessage: "Copy Message",
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

function formatCurrencyIdr(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
}

function subscriptionPlanLabel(locale: SupportedLocale): string {
  const duration = PAID_SUBSCRIPTION_DAYS === 30
    ? (locale === "id" ? "1 Bulan" : "1 Month")
    : (locale === "id" ? `${PAID_SUBSCRIPTION_DAYS} Hari` : `${PAID_SUBSCRIPTION_DAYS} Days`);
  return locale === "id"
    ? `Subscription Bot ${duration} - ${formatCurrencyIdr(PAID_SUBSCRIPTION_PRICE_IDR)}`
    : `Bot Subscription ${duration} - ${formatCurrencyIdr(PAID_SUBSCRIPTION_PRICE_IDR)}`;
}

function adminContactUrl(): string {
  return `https://t.me/${ADMIN_CONTACT_USERNAME.replace(/^@/, "")}`;
}

function buildSubscriptionTemplate(locale: SupportedLocale, userId: number, username?: string): string {
  const usernameText = username ? `@${username.replace(/^@/, "")}` : (locale === "id" ? "tidak ada" : "not set");
  const packageText = subscriptionPlanLabel(locale);
  return locale === "id"
    ? `Halo admin, saya ingin subscription bot.\nPaket: ${packageText}\nID user: ${userId}\nUsername Telegram: ${usernameText}`
    : `Hi admin, I want to subscribe to the bot.\nPackage: ${packageText}\nUser ID: ${userId}\nTelegram username: ${usernameText}`;
}

export function buildMainMenuKeyboard(
  locale: SupportedLocale,
  hasMailbox: boolean,
  hasHistory = hasMailbox,
  hasNote = false,
  highlightSubscription = false
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (highlightSubscription) {
    keyboard.text(`⭐ ${label(locale, "subscription")}`, "mt:subscription:open").row();
  }

  keyboard
    .text(label(locale, hasMailbox ? "regenerate" : "generate"), "mt:generate")
    .text(label(locale, "import"), "mt:import:open");

  if (hasMailbox) {
    keyboard
      .row()
      .text(label(locale, "refresh"), "mt:refresh")
      .text(label(locale, "resetSession"), "mt:session:reset");
    keyboard
      .row()
      .text(label(locale, "inbox"), "mt:inbox")
      .text(label(locale, hasNote ? "editNote" : "addNote"), "mt:note:open");

    if (hasNote) {
      keyboard.row().text(label(locale, "deleteNote"), "mt:note:delete");
    }
  }

  if (hasHistory) {
    keyboard.row().text(label(locale, "history"), "mt:history");
  }

  if (highlightSubscription) {
    keyboard.row().text(label(locale, "language"), "mt:lang:open");
    return keyboard;
  }

  keyboard
    .row()
    .text(label(locale, "subscription"), "mt:subscription:open")
    .text(label(locale, "language"), "mt:lang:open");
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

export function buildImportKeyboard(locale: SupportedLocale): InlineKeyboard {
  return new InlineKeyboard()
    .text(label(locale, "back"), "mt:menu");
}

export function buildSubscriptionKeyboard(locale: SupportedLocale, userId: number, username?: string): InlineKeyboard {
  return new InlineKeyboard()
    .url(label(locale, "contactAdmin"), adminContactUrl())
    .copyText(label(locale, "copyMessage"), buildSubscriptionTemplate(locale, userId, username))
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

  keyboard.row().text(label(locale, "import"), "mt:import:open");
  keyboard.text(label(locale, "back"), "mt:menu");
  return keyboard;
}
