import chromium from "@sparticuz/chromium";
import { chromium as playwrightChromium, type Page } from "playwright-core";
import {
  MAILTICKING_URL,
  MAX_INBOX_ITEMS,
  PLAYWRIGHT_DEFAULT_TIMEOUT_MS,
  PLAYWRIGHT_NAVIGATION_TIMEOUT_MS,
  getProxyUrl
} from "./config.js";
import type {
  BrowserStorageState,
  InboxCache,
  InboxItem,
  ProxySettings,
  ScraperMailboxResult,
  ScraperRefreshResult
} from "./types.js";
import { buildReadablePassword, extractDomain, normalizeLine, pickRandom, randomDelay } from "./utils.js";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
];

class MailboxExpiredError extends Error {
  constructor(message = "Mailbox session expired") {
    super(message);
    this.name = "MailboxExpiredError";
  }
}

function parseProxyUrl(value?: string): ProxySettings | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new URL(value);
  return {
    server: `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`,
    username: parsed.username || undefined,
    password: parsed.password || undefined
  };
}

async function createBrowserContext(storageState?: BrowserStorageState) {
  const browser = await playwrightChromium.launch({
    args: [...chromium.args, "--disable-blink-features=AutomationControlled"],
    executablePath: await chromium.executablePath(),
    headless: true,
    proxy: parseProxyUrl(getProxyUrl()),
    timeout: PLAYWRIGHT_DEFAULT_TIMEOUT_MS
  });

  const context = await browser.newContext({
    storageState: storageState as any,
    userAgent: pickRandom(USER_AGENTS),
    locale: "en-US",
    timezoneId: "UTC",
    viewport: {
      width: 1366,
      height: 920
    }
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => false
    });
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"]
    });
    Object.defineProperty(navigator, "platform", {
      get: () => "Win32"
    });
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3]
    });
    Object.defineProperty(window, "chrome", {
      get: () => ({
        runtime: {}
      })
    });
  });

  return { browser, context };
}

async function openMailTicking(page: Page): Promise<void> {
  page.setDefaultTimeout(PLAYWRIGHT_DEFAULT_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(PLAYWRIGHT_NAVIGATION_TIMEOUT_MS);
  await page.goto(MAILTICKING_URL, {
    waitUntil: "domcontentloaded"
  });
  await randomDelay(600, 1_200);
}

async function waitForActiveMailbox(page: Page, timeout = PLAYWRIGHT_DEFAULT_TIMEOUT_MS): Promise<{ email: string; code: string }> {
  await page.waitForFunction(() => {
    const input = document.querySelector("#active-mail") as HTMLInputElement | null;
    return Boolean(input && input.value.includes("@") && input.getAttribute("data-code"));
  }, { timeout });

  return page.evaluate(() => {
    const input = document.querySelector("#active-mail") as HTMLInputElement | null;
    return {
      email: input?.value?.trim() ?? "",
      code: input?.getAttribute("data-code")?.trim() ?? ""
    };
  });
}

async function postJson(page: Page, url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const payload = await page.evaluate(async ({ targetUrl, targetBody }) => {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(targetBody)
    });

    let responsePayload: unknown;
    try {
      responsePayload = await response.json();
    } catch {
      responsePayload = undefined;
    }

    return {
      ok: response.ok,
      status: response.status,
      payload: responsePayload
    };
  }, { targetUrl: url, targetBody: body });

  if (!payload.ok) {
    const responseBody = payload.payload && typeof payload.payload === "object"
      ? payload.payload as Record<string, unknown>
      : {};
    const detail = typeof responseBody.error === "string"
      ? responseBody.error
      : typeof responseBody.message === "string"
        ? responseBody.message
        : `status ${payload.status}`;
    throw new Error(`MailTicking request failed for ${url}: ${detail}`);
  }

  if (!payload.payload || typeof payload.payload !== "object") {
    throw new Error(`MailTicking returned an invalid JSON payload for ${url}`);
  }

  return payload.payload as Record<string, unknown>;
}

async function generatePublicMailbox(page: Page): Promise<string> {
  const payload = await postJson(page, "/get-mailbox", {
    types: ["4"]
  });

  if (payload.success !== true || typeof payload.email !== "string" || !payload.email.includes("@")) {
    throw new Error("MailTicking did not return a valid public mailbox");
  }

  if (extractDomain(payload.email).includes("gmail")) {
    throw new Error(`MailTicking returned a Gmail mailbox unexpectedly: ${payload.email}`);
  }

  return payload.email;
}

async function activateMailbox(page: Page, email: string): Promise<void> {
  const payload = await postJson(page, "/activate-email", { email });

  if (payload.success !== true) {
    throw new Error(`MailTicking could not activate mailbox ${email}`);
  }

  await randomDelay(700, 1_400);
  await page.reload({ waitUntil: "domcontentloaded" });
}

async function ensureActiveMailbox(page: Page, requestedEmail?: string): Promise<{ email: string; code: string }> {
  try {
    const current = await waitForActiveMailbox(page, 4_000);
    if (!requestedEmail || current.email === requestedEmail) {
      return current;
    }
  } catch {
    // fall through to re-activate below
  }

  if (!requestedEmail) {
    throw new MailboxExpiredError();
  }

  await activateMailbox(page, requestedEmail);

  const activated = await waitForActiveMailbox(page, 8_000);
  if (activated.email !== requestedEmail) {
    throw new MailboxExpiredError(`Activated mailbox mismatch: expected ${requestedEmail}, got ${activated.email}`);
  }

  return activated;
}

function normalizeInboxFromJson(payload: unknown): InboxItem[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const emails = Array.isArray(record.emails)
    ? record.emails
    : Array.isArray(record.data)
      ? record.data
      : [];

  const items: InboxItem[] = [];

  emails.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        return;
      }

      const entry = item as Record<string, unknown>;
      const sender = normalizeLine(
        entry.sender ?? entry.from ?? entry.fromName ?? entry.mail_from,
        "Unknown sender"
      );
      const subject = normalizeLine(entry.subject ?? entry.title ?? entry.mail_subject, "No subject");
      const preview = normalizeLine(
        entry.preview ?? entry.snippet ?? entry.content ?? entry.text,
        "No preview yet"
      );
      const receivedAt = typeof entry.receivedAt === "string"
        ? entry.receivedAt
        : typeof entry.receiveTime === "string"
          ? entry.receiveTime
          : typeof entry.time === "string"
            ? entry.time
            : undefined;
      const detailUrl = typeof entry.url === "string"
        ? entry.url
        : typeof entry.href === "string"
          ? entry.href
          : typeof entry.detailUrl === "string"
            ? entry.detailUrl
            : undefined;

      items.push({
        id: String(entry.id ?? detailUrl ?? `${index + 1}`),
        sender,
        subject,
        preview,
        receivedAt,
        detailUrl
      });
    });

  return items.slice(0, MAX_INBOX_ITEMS);
}

async function parseInboxFromDom(page: Page): Promise<InboxItem[]> {
  const items = await page.evaluate((limit) => {
    return Array.from(document.querySelectorAll("#message-list tr"))
      .slice(0, limit)
      .map((row, index) => {
        const cells = Array.from(row.querySelectorAll("td"));
        const link = row.querySelector("a");
        const sender = cells[0]?.textContent?.trim() ?? "Unknown sender";
        const subjectBlock = cells[1]?.textContent?.replace(/\r/g, "") ?? "";
        const lines = subjectBlock
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        const subject = link?.textContent?.trim() ?? lines[0] ?? "No subject";
        const preview = lines.filter((line) => line !== subject).join(" ").trim() || "No preview yet";
        const receivedAt = cells[2]?.textContent?.trim() || undefined;
        const href = link?.href ?? undefined;

        return {
          id: href ?? `row-${index + 1}`,
          sender,
          subject,
          preview,
          receivedAt,
          detailUrl: href,
          isUnread: row.classList.contains("unread")
        };
      })
      .filter((item) => item.subject || item.preview || item.sender);
  }, MAX_INBOX_ITEMS);

  return items.map((item) => ({
    ...item,
    sender: normalizeLine(item.sender, "Unknown sender"),
    subject: normalizeLine(item.subject, "No subject"),
    preview: normalizeLine(item.preview, "No preview yet")
  }));
}

function buildInboxCache(items: InboxItem[], source: InboxCache["source"]): InboxCache {
  return {
    items,
    refreshedAt: new Date().toISOString(),
    source
  };
}

export async function generateMailbox(previousState?: BrowserStorageState): Promise<ScraperMailboxResult> {
  const { browser, context } = await createBrowserContext(previousState);

  try {
    const page = await context.newPage();
    await openMailTicking(page);

    const requestedEmail = await generatePublicMailbox(page);
    await activateMailbox(page, requestedEmail);
    const activeMailbox = await ensureActiveMailbox(page, requestedEmail);

    const inboxItems = await parseInboxFromDom(page);
    const storageState = await context.storageState();
    const now = new Date().toISOString();
    const domain = extractDomain(activeMailbox.email);

    return {
      mailbox: {
        email: activeMailbox.email,
        code: activeMailbox.code,
        domain,
        password: buildReadablePassword(),
        sourceUrl: MAILTICKING_URL,
        createdAt: now,
        updatedAt: now
      },
      inboxCache: buildInboxCache(inboxItems, "dom"),
      storageState
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function refreshInbox(existingMailbox: { email: string; code: string; password: string; createdAt: string }, storageState?: BrowserStorageState): Promise<ScraperRefreshResult> {
  const { browser, context } = await createBrowserContext(storageState);

  try {
    const page = await context.newPage();
    await openMailTicking(page);

    let activeMailbox = await ensureActiveMailbox(page, existingMailbox.email);
    if (!activeMailbox.email || !activeMailbox.code) {
      throw new MailboxExpiredError();
    }

    let payload = await postJson(page, "/get-emails?lang=en", activeMailbox);

    if (payload.needNewEmail) {
      await activateMailbox(page, existingMailbox.email);
      activeMailbox = await ensureActiveMailbox(page, existingMailbox.email);
      payload = await postJson(page, "/get-emails?lang=en", activeMailbox);

      if (payload.needNewEmail) {
        throw new MailboxExpiredError();
      }
    }

    await randomDelay(800, 1_500);
    await page.reload({ waitUntil: "domcontentloaded" });
    activeMailbox = await ensureActiveMailbox(page, existingMailbox.email);

    const domItems = await parseInboxFromDom(page);
    const jsonItems = normalizeInboxFromJson(payload);
    const items = domItems.length > 0 && jsonItems.length > 0
      ? domItems
      : domItems.length > 0
        ? domItems
        : jsonItems;

    const source = domItems.length > 0 && jsonItems.length > 0
      ? "mixed"
      : domItems.length > 0
        ? "dom"
        : "json";

    const nextStorageState = await context.storageState();
    const now = new Date().toISOString();
    return {
      mailbox: {
        email: activeMailbox.email,
        code: activeMailbox.code,
        domain: extractDomain(activeMailbox.email),
        password: existingMailbox.password,
        sourceUrl: MAILTICKING_URL,
        createdAt: existingMailbox.createdAt,
        updatedAt: now
      },
      inboxCache: buildInboxCache(items, source),
      storageState: nextStorageState
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

export { MailboxExpiredError };
