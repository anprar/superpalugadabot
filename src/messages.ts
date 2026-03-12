import { ADMIN_CONTACT_USERNAME, PAID_SUBSCRIPTION_PRICE_IDR } from "./config.js";
import type { AccountPlan, InboxCache, InboxItem, KoreaProfileSuggestion, MailboxSession, SupportedLocale, UserAccount } from "./types.js";
import { escapeHtml, formatBirthDate, formatDateTime, getAgeYears, trimPreview } from "./utils.js";

const COPY: Record<SupportedLocale, Record<string, string>> = {
  id: {
    readyTitle: "Data siap dipakai",
    inboxTitle: "Inbox aktif",
    email: "Email",
    note: "Catatan",
    password: "Password saran",
    passwordNote: "Password ini dibuat otomatis untuk membantu pengisian form.",
    fullName: "Nama",
    birthDate: "Tanggal lahir",
    age: "Umur sekarang",
    koreanProfile: "Profil & alamat",
    virtualCardsTitle: "Virtual CC Tersedia (BIN 625814260)",
    address: "Alamat",
    cityDistrict: "Kota / Kabupaten",
    postalCode: "Kode pos",
    noProfiles: "Belum ada rekomendasi profil.",
    userId: "ID user",
    subscriptionStatus: "Status subscription",
    historyLimit: "Batas riwayat",
    planExpiresAt: "Aktif sampai",
    paymentInfo: "Upgrade manual",
    paymentContactText: "Hubungi admin",
    pricePerMonth: "Harga",
    accountTitle: "Status akun",
    planFree: "Free",
    planPaid: "Paid",
    planCustom: "Custom",
    adminOnly: "Perintah ini hanya untuk admin.",
    adminSetPlanUsage: "Format: /setplan user_id free | /setplan user_id paid | /setplan user_id custom 100",
    adminSetPlanDone: "Status akun berhasil diperbarui.",
    planReminderTitle: "Subscription akan berakhir 7 hari lagi",
    planReminderBody: "Jika tidak diperpanjang, status akun akan kembali ke Free dan riwayat email akan dipotong ke 8 email terbaru.",
    planExpiredTitle: "Subscription sudah berakhir",
    planExpiredBody: "Status akun kembali ke Free. Riwayat email disimpan hanya 8 email terbaru.",
    historyTitle: "Riwayat email",
    historyEmpty: "Belum ada email tersimpan untuk direstore.",
    historyCurrent: "aktif sekarang",
    historyCreated: "dibuat",
    historyUpdated: "diperbarui",
    restoreQueued: "Email lama berhasil dipilih. Bot sedang mencoba restore dan refresh inbox.",
    restoreMissing: "Email tersebut tidak ditemukan di riwayat.",
    importTitle: "Input email sendiri",
    importPrompt: "Kirim 1 alamat email MailTicking yang pernah kamu buat. Domain apa pun boleh selama memang terdaftar di web.",
    importAllowedDomains: "Domain yang didukung",
    importQueued: "Email berhasil dimasukkan ke history. Bot sedang mencoba restore dan refresh inbox.",
    importInvalidFormat: "Format email tidak valid. Kirim ulang dalam format nama@domain.com.",
    progressOpeningSession: "Sedang buka sesi MailTicking...",
    progressFetchingInbox: "Sedang ambil inbox...",
    progressRetrying: "Percobaan sebelumnya gagal. Bot sedang mencoba ulang sebentar...",
    noteTitle: "Catatan email",
    notePrompt: "Kirim 1 pesan berisi catatan untuk email aktif. Nanti catatan ini akan tampil saat email dibuka.",
    noteSaved: "Catatan berhasil disimpan untuk email aktif.",
    noteInvalid: "Catatan tidak boleh kosong.",
    noteDeleted: "Catatan email berhasil dihapus.",
    noteDeleteMissing: "Email aktif belum punya catatan untuk dihapus.",
    resetSessionDone: "Sesi browser berhasil direset. Coba refresh atau restore lagi jika tadi terasa macet.",
    importInvalidDomain: "Domain email tidak didukung. Gunakan salah satu domain yang diizinkan.",
    domainRestricted: "Email ini tidak memakai domain yang diizinkan untuk generate atau restore.",
    allowedDomainsBusy: "MailTicking belum mengeluarkan email dari domain yang diizinkan. Coba lagi sebentar.",
    deleteDone: "Email berhasil dihapus dari riwayat.",
    deleteMissing: "Email yang ingin dihapus tidak ditemukan di riwayat.",
    deleteCurrent: "Email aktif tidak bisa dihapus dari riwayat. Ganti email aktif dulu.",
    syncedAt: "Sinkron terakhir",
    inboxItems: "Email terbaru",
    inboxEmpty: "Inbox masih kosong.",
    mailboxExpired: "Sesi email sudah habis atau berubah. Jalankan generate ulang.",
    genericError: "Gagal memproses permintaan sekarang. Coba lagi sebentar lagi.",
    unknownSender: "Pengirim tidak diketahui",
    noSubject: "Tanpa subject",
    noPreview: "Belum ada preview"
  },
  en: {
    readyTitle: "Data ready",
    inboxTitle: "Active inbox",
    email: "Email",
    note: "Note",
    password: "Suggested password",
    passwordNote: "This password is generated automatically to help fill signup forms.",
    fullName: "Name",
    birthDate: "Date of birth",
    age: "Current age",
    koreanProfile: "Profile & address",
    virtualCardsTitle: "Available Virtual CC (BIN 625814260)",
    address: "Address",
    cityDistrict: "City / District",
    postalCode: "Postal code",
    noProfiles: "No profile recommendations yet.",
    userId: "User ID",
    subscriptionStatus: "Subscription status",
    historyLimit: "History limit",
    planExpiresAt: "Active until",
    paymentInfo: "Manual upgrade",
    paymentContactText: "Contact admin",
    pricePerMonth: "Price",
    accountTitle: "Account status",
    planFree: "Free",
    planPaid: "Paid",
    planCustom: "Custom",
    adminOnly: "This command is only available to the admin.",
    adminSetPlanUsage: "Format: /setplan user_id free | /setplan user_id paid | /setplan user_id custom 100",
    adminSetPlanDone: "The account status was updated.",
    planReminderTitle: "Your subscription will end in 7 days",
    planReminderBody: "If it is not renewed, your account will return to Free and the email history will be reduced to the latest 8 emails.",
    planExpiredTitle: "Your subscription has ended",
    planExpiredBody: "Your account has returned to Free. Only the latest 8 emails are kept in history.",
    historyTitle: "Email history",
    historyEmpty: "No saved emails are available to restore.",
    historyCurrent: "current",
    historyCreated: "created",
    historyUpdated: "updated",
    restoreQueued: "The older email was selected. The bot is now restoring it and refreshing the inbox.",
    restoreMissing: "That email was not found in history.",
    importTitle: "Add your own email",
    importPrompt: "Send 1 MailTicking email address you created before. Any domain is allowed as long as it is registered on the site.",
    importAllowedDomains: "Supported domains",
    importQueued: "The email was saved to history. The bot is now restoring it and refreshing the inbox.",
    importInvalidFormat: "The email format is invalid. Send it again as name@domain.com.",
    progressOpeningSession: "Opening the MailTicking session...",
    progressFetchingInbox: "Fetching the inbox...",
    progressRetrying: "The previous attempt failed. Retrying shortly...",
    noteTitle: "Email note",
    notePrompt: "Send 1 message containing a note for the active email. The note will appear whenever the email is opened.",
    noteSaved: "The note was saved for the active email.",
    noteInvalid: "The note cannot be empty.",
    noteDeleted: "The email note was deleted.",
    noteDeleteMissing: "The active email does not have a note to delete.",
    resetSessionDone: "The browser session was reset. Try refreshing or restoring again if it was stuck.",
    importInvalidDomain: "That email domain is not supported. Use one of the allowed domains.",
    domainRestricted: "This email does not use an allowed domain for generate or restore.",
    allowedDomainsBusy: "MailTicking is not returning an email from the allowed domains right now. Please try again shortly.",
    deleteDone: "The email was removed from history.",
    deleteMissing: "The email to remove was not found in history.",
    deleteCurrent: "The active email cannot be removed from history. Switch active email first.",
    syncedAt: "Last synced",
    inboxItems: "Recent emails",
    inboxEmpty: "Inbox is still empty.",
    mailboxExpired: "The mailbox session expired or changed. Generate a new one.",
    genericError: "The request could not be processed right now. Please try again in a moment.",
    unknownSender: "Unknown sender",
    noSubject: "No subject",
    noPreview: "No preview yet"
  }
};

function copy(locale: SupportedLocale, key: string): string {
  return COPY[locale][key];
}

function renderAllowedDomains(domains: string[]): string {
  return domains.map((domain) => `<code>${escapeHtml(domain)}</code>`).join("\n");
}

function planLabel(locale: SupportedLocale, plan: AccountPlan): string {
  return copy(locale, plan === "free" ? "planFree" : plan === "paid" ? "planPaid" : "planCustom");
}

function formatCurrencyIdr(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
}

function renderInboxItems(locale: SupportedLocale, items: InboxItem[]): string {
  if (items.length === 0) {
    return `${copy(locale, "inboxEmpty")}`;
  }

  return items
    .map((item, index) => {
      const sender = escapeHtml(item.sender || copy(locale, "unknownSender"));
      const subject = escapeHtml(item.subject || copy(locale, "noSubject"));
      const preview = escapeHtml(trimPreview(item.preview || copy(locale, "noPreview")));
      const time = item.receivedAt ? `\n  <i>${escapeHtml(item.receivedAt)}</i>` : "";
      return `${index + 1}. <b>${subject}</b>\n  ${sender}\n  ${preview}${time}`;
    })
    .join("\n\n");
}

function getPrimaryKoreanProfile(mailbox: MailboxSession): KoreaProfileSuggestion | undefined {
  return mailbox.koreanProfile ?? mailbox.koreanProfiles?.[0];
}

function renderKoreanProfile(locale: SupportedLocale, mailbox: MailboxSession): string {
  const profile = getPrimaryKoreanProfile(mailbox);
  if (!profile) {
    return copy(locale, "noProfiles");
  }

  const age = getAgeYears(profile.birthDate);
  return [
    `  <b>${copy(locale, "fullName")}</b> <code>${escapeHtml(profile.fullName)}</code>`,
    `  <b>${copy(locale, "birthDate")}</b> <code>${escapeHtml(formatBirthDate(profile.birthDate, locale))}</code>`,
    `  <b>${copy(locale, "age")}</b> <code>${escapeHtml(`${age}`)}</code>`,
    `  <b>${copy(locale, "address")}</b> <code>${escapeHtml(profile.addressLine)}</code>`,
    `  <b>${copy(locale, "cityDistrict")}</b> <code>${escapeHtml(`${profile.city}, ${profile.district}`)}</code>`,
    `  <b>${copy(locale, "postalCode")}</b> <code>${escapeHtml(profile.postalCode)}</code>`
  ].join("\n");
}

function renderBaseMailbox(locale: SupportedLocale, mailbox: MailboxSession): string {
  const block = [
    `<b>${copy(locale, "email")}</b>`,
    `<code>${escapeHtml(mailbox.email)}</code>`
  ];

  if (mailbox.note) {
    block.push("", `<b>${copy(locale, "note")}</b>`, escapeHtml(mailbox.note));
  }

  if (mailbox.origin === "imported") {
    return block.join("\n");
  }

  block.push(
    "",
    `<b>${copy(locale, "password")}</b>`,
    `<code>${escapeHtml(mailbox.password)}</code>`,
    `<i>${escapeHtml(copy(locale, "passwordNote"))}</i>`,
    "",
    `<b>${copy(locale, "koreanProfile")}</b>`,
    renderKoreanProfile(locale, mailbox)
  );

  if (mailbox.virtualCards && mailbox.virtualCards.length > 0) {
    const cardsText = mailbox.virtualCards
      .map((c) => `💳 <code>${c.number}</code> | ${c.expiry} | <code>${c.cvv}</code>`)
      .join("\n");
    block.push("", `<b>${copy(locale, "virtualCardsTitle")}</b>`, cardsText);
  }

  return block.join("\n");
}

export function buildMailboxReadyMessage(
  locale: SupportedLocale,
  mailbox: MailboxSession,
  inboxCache?: InboxCache
): string {
  const lines = [`<b>${copy(locale, "readyTitle")}</b>`, "", renderBaseMailbox(locale, mailbox)];

  if (inboxCache) {
    lines.push(
      "",
      `<b>${copy(locale, "syncedAt")}</b> ${escapeHtml(formatDateTime(inboxCache.refreshedAt, locale))}`,
      "",
      `<b>${copy(locale, "inboxItems")}</b>`,
      renderInboxItems(locale, inboxCache.items)
    );
  }

  return lines.join("\n");
}

export function buildInboxMessage(
  locale: SupportedLocale,
  mailbox: MailboxSession,
  inboxCache?: InboxCache
): string {
  const lines = [`<b>${copy(locale, "inboxTitle")}</b>`, "", renderBaseMailbox(locale, mailbox)];

  if (inboxCache) {
    lines.push(
      "",
      `<b>${copy(locale, "syncedAt")}</b> ${escapeHtml(formatDateTime(inboxCache.refreshedAt, locale))}`,
      "",
      `<b>${copy(locale, "inboxItems")}</b>`,
      renderInboxItems(locale, inboxCache.items)
    );
  } else {
    lines.push("", `<b>${copy(locale, "inboxItems")}</b>`, copy(locale, "inboxEmpty"));
  }

  return lines.join("\n");
}

export function buildMailboxExpiredMessage(locale: SupportedLocale): string {
  return `<b>${copy(locale, "mailboxExpired")}</b>`;
}

export function buildWelcomeMessage(locale: SupportedLocale, userId: number, account: UserAccount, startText: string): string {
  return [
    escapeHtml(startText),
    "",
    `<b>${copy(locale, "accountTitle")}</b>`,
    `<b>${copy(locale, "userId")}</b> <code>${userId}</code>`,
    `<b>${copy(locale, "subscriptionStatus")}</b> <code>${escapeHtml(planLabel(locale, account.plan))}</code>`,
    `<b>${copy(locale, "historyLimit")}</b> <code>${account.historyLimit}</code>`,
    account.expiresAt ? `<b>${copy(locale, "planExpiresAt")}</b> ${escapeHtml(formatDateTime(account.expiresAt, locale))}` : undefined,
    `<b>${copy(locale, "paymentInfo")}</b> ${escapeHtml(copy(locale, "paymentContactText"))} <code>${escapeHtml(ADMIN_CONTACT_USERNAME)}</code>`,
    `<b>${copy(locale, "pricePerMonth")}</b> <code>${escapeHtml(formatCurrencyIdr(PAID_SUBSCRIPTION_PRICE_IDR))}/30 hari</code>`
  ].filter(Boolean).join("\n");
}

export function buildAccountStatusMessage(locale: SupportedLocale, userId: number, account: UserAccount): string {
  return [
    `<b>${copy(locale, "accountTitle")}</b>`,
    "",
    `<b>${copy(locale, "userId")}</b> <code>${userId}</code>`,
    `<b>${copy(locale, "subscriptionStatus")}</b> <code>${escapeHtml(planLabel(locale, account.plan))}</code>`,
    `<b>${copy(locale, "historyLimit")}</b> <code>${account.historyLimit}</code>`,
    account.expiresAt ? `<b>${copy(locale, "planExpiresAt")}</b> ${escapeHtml(formatDateTime(account.expiresAt, locale))}` : undefined,
    `<b>${copy(locale, "paymentInfo")}</b> ${escapeHtml(copy(locale, "paymentContactText"))} <code>${escapeHtml(ADMIN_CONTACT_USERNAME)}</code>`,
    `<b>${copy(locale, "pricePerMonth")}</b> <code>${escapeHtml(formatCurrencyIdr(PAID_SUBSCRIPTION_PRICE_IDR))}/30 hari</code>`
  ].filter(Boolean).join("\n");
}

export function buildWorkerErrorMessage(locale: SupportedLocale): string {
  return `<b>${copy(locale, "genericError")}</b>`;
}

export function buildAdminOnlyMessage(locale: SupportedLocale): string {
  return `<b>${copy(locale, "adminOnly")}</b>`;
}

export function buildAdminSetPlanUsageMessage(locale: SupportedLocale): string {
  return `<b>${copy(locale, "adminSetPlanUsage")}</b>`;
}

export function buildAdminPlanUpdatedMessage(locale: SupportedLocale, userId: number, account: UserAccount): string {
  return [
    `<b>${copy(locale, "adminSetPlanDone")}</b>`,
    "",
    `<b>${copy(locale, "userId")}</b> <code>${userId}</code>`,
    `<b>${copy(locale, "subscriptionStatus")}</b> <code>${escapeHtml(planLabel(locale, account.plan))}</code>`,
    `<b>${copy(locale, "historyLimit")}</b> <code>${account.historyLimit}</code>`,
    account.expiresAt ? `<b>${copy(locale, "planExpiresAt")}</b> ${escapeHtml(formatDateTime(account.expiresAt, locale))}` : undefined
  ].filter(Boolean).join("\n");
}

export function buildPlanReminderMessage(locale: SupportedLocale, account: UserAccount): string {
  return [
    `<b>${copy(locale, "planReminderTitle")}</b>`,
    "",
    `<b>${copy(locale, "subscriptionStatus")}</b> <code>${escapeHtml(planLabel(locale, account.plan))}</code>`,
    account.expiresAt ? `<b>${copy(locale, "planExpiresAt")}</b> ${escapeHtml(formatDateTime(account.expiresAt, locale))}` : undefined,
    copy(locale, "planReminderBody")
  ].filter(Boolean).join("\n");
}

export function buildPlanExpiredMessage(locale: SupportedLocale): string {
  return [
    `<b>${copy(locale, "planExpiredTitle")}</b>`,
    "",
    copy(locale, "planExpiredBody")
  ].join("\n");
}

export function buildHistoryMessage(
  locale: SupportedLocale,
  history: MailboxSession[],
  currentEmail?: string
): string {
  if (history.length === 0) {
    return `<b>${copy(locale, "historyTitle")}</b>\n\n${copy(locale, "historyEmpty")}`;
  }

  const lines = history.map((mailbox, index) => {
    const current = mailbox.email === currentEmail ? ` <i>(${copy(locale, "historyCurrent")})</i>` : "";
    const preview = mailbox.note
      ? `  <b>${copy(locale, "note")}</b> ${escapeHtml(trimPreview(mailbox.note, 90))}`
      : undefined;
    return [
      `${index + 1}. <code>${escapeHtml(mailbox.email)}</code>${current}`,
      `  <b>${copy(locale, "historyCreated")}</b> ${escapeHtml(formatDateTime(mailbox.createdAt, locale))}`,
      `  <b>${copy(locale, "historyUpdated")}</b> ${escapeHtml(formatDateTime(mailbox.updatedAt, locale))}`,
      preview
    ].filter(Boolean).join("\n");
  });

  return [`<b>${copy(locale, "historyTitle")}</b>`, "", ...lines].join("\n\n");
}

export function buildRestoreQueuedMessage(locale: SupportedLocale, email: string): string {
  return [
    `<b>${copy(locale, "restoreQueued")}</b>`,
    "",
    `<code>${escapeHtml(email)}</code>`
  ].join("\n");
}

export function buildRestoreMissingMessage(locale: SupportedLocale): string {
  return `<b>${copy(locale, "restoreMissing")}</b>`;
}

export function buildImportPromptMessage(locale: SupportedLocale): string {
  return [
    `<b>${copy(locale, "importTitle")}</b>`,
    "",
    copy(locale, "importPrompt")
  ].join("\n");
}

export function buildImportQueuedMessage(locale: SupportedLocale, email: string): string {
  return [
    `<b>${copy(locale, "importQueued")}</b>`,
    "",
    `<code>${escapeHtml(email)}</code>`
  ].join("\n");
}

export function buildImportInvalidFormatMessage(locale: SupportedLocale): string {
  return `<b>${copy(locale, "importInvalidFormat")}</b>`;
}

export function buildJobProgressMessage(
  locale: SupportedLocale,
  stage: "opening-session" | "fetching-inbox" | "retrying",
  email?: string
): string {
  const key = stage === "opening-session"
    ? "progressOpeningSession"
    : stage === "fetching-inbox"
      ? "progressFetchingInbox"
      : "progressRetrying";

  return [
    `<b>${copy(locale, key)}</b>`,
    email ? "" : undefined,
    email ? `<code>${escapeHtml(email)}</code>` : undefined
  ].filter(Boolean).join("\n");
}

export function buildNotePromptMessage(locale: SupportedLocale, email: string): string {
  return [
    `<b>${copy(locale, "noteTitle")}</b>`,
    "",
    `<code>${escapeHtml(email)}</code>`,
    "",
    copy(locale, "notePrompt")
  ].join("\n");
}

export function buildNoteSavedMessage(locale: SupportedLocale, email: string): string {
  return [
    `<b>${copy(locale, "noteSaved")}</b>`,
    "",
    `<code>${escapeHtml(email)}</code>`
  ].join("\n");
}

export function buildNoteInvalidMessage(locale: SupportedLocale): string {
  return `<b>${copy(locale, "noteInvalid")}</b>`;
}

export function buildNoteDeletedMessage(locale: SupportedLocale, email: string): string {
  return [
    `<b>${copy(locale, "noteDeleted")}</b>`,
    "",
    `<code>${escapeHtml(email)}</code>`
  ].join("\n");
}

export function buildNoteDeleteMissingMessage(locale: SupportedLocale): string {
  return `<b>${copy(locale, "noteDeleteMissing")}</b>`;
}

export function buildResetSessionDoneMessage(locale: SupportedLocale, email: string): string {
  return [
    `<b>${copy(locale, "resetSessionDone")}</b>`,
    "",
    `<code>${escapeHtml(email)}</code>`
  ].join("\n");
}

export function buildImportInvalidDomainMessage(locale: SupportedLocale, domains: string[]): string {
  return [
    `<b>${copy(locale, "importInvalidDomain")}</b>`,
    "",
    renderAllowedDomains(domains)
  ].join("\n");
}

export function buildDomainRestrictedMessage(locale: SupportedLocale, email: string, domains: string[]): string {
  return [
    `<b>${copy(locale, "domainRestricted")}</b>`,
    "",
    `<code>${escapeHtml(email)}</code>`,
    "",
    renderAllowedDomains(domains)
  ].join("\n");
}

export function buildAllowedDomainsBusyMessage(locale: SupportedLocale, domains: string[]): string {
  return [
    `<b>${copy(locale, "allowedDomainsBusy")}</b>`,
    "",
    renderAllowedDomains(domains)
  ].join("\n");
}

export function buildDeleteHistoryDoneMessage(locale: SupportedLocale): string {
  return `<b>${copy(locale, "deleteDone")}</b>`;
}

export function buildDeleteHistoryMissingMessage(locale: SupportedLocale): string {
  return `<b>${copy(locale, "deleteMissing")}</b>`;
}

export function buildDeleteCurrentHistoryMessage(locale: SupportedLocale): string {
  return `<b>${copy(locale, "deleteCurrent")}</b>`;
}
