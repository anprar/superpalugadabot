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

async function waitForActiveMailbox(page: Page): Promise<{ email: string; code: string }> {
  await page.waitForFunction(() => {
    const input = document.querySelector("#active-mail") as HTMLInputElement | null;
    return Boolean(input && input.value.includes("@") && input.getAttribute("data-code"));
  });

  return page.evaluate(() => {
    const input = document.querySelector("#active-mail") as HTMLInputElement | null;
    return {
      email: input?.value?.trim() ?? "",
      code: input?.getAttribute("data-code")?.trim() ?? ""
    };
  });
}

async function readPublicDomains(page: Page): Promise<string[]> {
  const domains = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.dropdown-menu a[data-type="4"][data-vip="false"]'))
      .map((item) => item.textContent?.trim() ?? "")
      .map((item) => item.replace(/^@/, "").trim())
      .filter((item) => item.length > 0 && !item.includes("gmail"));
  });

  return Array.from(new Set(domains));
}

async function changeMailboxDomain(page: Page, currentEmail: string, currentCode: string, domain: string): Promise<void> {
  const result = await page.evaluate(async ({ email, code, nextDomain }) => {
    const response = await fetch("/change-mailbox", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        oldMail: email,
        code,
        type: 4,
        domain: nextDomain
      })
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    return {
      ok: response.ok,
      payload
    };
  }, { email: currentEmail, code: currentCode, nextDomain: domain });

  if (!result.ok) {
    throw new Error(`MailTicking rejected domain change to ${domain}`);
  }

  await randomDelay(700, 1_400);
  await page.reload({ waitUntil: "domcontentloaded" });
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

    let activeMailbox = await waitForActiveMailbox(page);
    const publicDomains = await readPublicDomains(page);
    const currentDomain = extractDomain(activeMailbox.email);
    const nextDomain = publicDomains.find((domain) => domain !== currentDomain) ?? publicDomains[0];

    if (nextDomain && (currentDomain.includes("gmail") || currentDomain.includes("googlemail") || currentDomain !== nextDomain)) {
      await changeMailboxDomain(page, activeMailbox.email, activeMailbox.code, nextDomain);
      activeMailbox = await waitForActiveMailbox(page);
    }

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
  if (!storageState) {
    throw new MailboxExpiredError();
  }

  const { browser, context } = await createBrowserContext(storageState);

  try {
    const page = await context.newPage();
    await openMailTicking(page);

    let activeMailbox = await waitForActiveMailbox(page);
    if (!activeMailbox.email || !activeMailbox.code) {
      throw new MailboxExpiredError();
    }

    const payload = await page.evaluate(async ({ email, code }) => {
      const response = await fetch("/get-emails?lang=en", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ email, code })
      });

      return response.json().catch(() => undefined);
    }, activeMailbox);

    const payloadRecord = payload as Record<string, unknown> | undefined;
    if (payloadRecord?.needNewEmail) {
      throw new MailboxExpiredError();
    }

    await randomDelay(800, 1_500);
    await page.reload({ waitUntil: "domcontentloaded" });
    activeMailbox = await waitForActiveMailbox(page);

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
