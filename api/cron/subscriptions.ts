import { getBot } from "../../src/bot.js";
import { downgradeExpiredAccount, isExpiredPaidAccount, isReminderDue, listTrackedAccounts, markReminderSent } from "../../src/accounts.js";
import { getCronSecret } from "../../src/config.js";
import { buildPlanExpiredMessage, buildPlanReminderMessage } from "../../src/messages.js";
import { getChatSession, syncChatSessionWithAccount } from "../../src/sessions.js";
import type { SupportedLocale } from "../../src/types.js";

function getLocale(chatLocale?: string): SupportedLocale {
  return chatLocale === "en" ? "en" : "id";
}

function isAuthorized(request: Request): boolean {
  const secret = getCronSecret();
  if (!secret) {
    return true;
  }

  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const bot = getBot();
  await bot.init();

  let reminded = 0;
  let downgraded = 0;

  for (const account of await listTrackedAccounts()) {
    const session = await getChatSession(account.chatId);
    const locale = getLocale(session.__language_code);

    if (isExpiredPaidAccount(account)) {
      const downgradedAccount = await downgradeExpiredAccount(account.userId);
      await syncChatSessionWithAccount(account.chatId, downgradedAccount).catch(() => undefined);
      await bot.api.sendMessage(account.chatId, buildPlanExpiredMessage(locale), {
        parse_mode: "HTML"
      }).catch(() => undefined);
      downgraded += 1;
      continue;
    }

    if (isReminderDue(account)) {
      await bot.api.sendMessage(account.chatId, buildPlanReminderMessage(locale, account), {
        parse_mode: "HTML"
      }).catch(() => undefined);
      await markReminderSent(account.userId);
      reminded += 1;
    }
  }

  return Response.json({
    ok: true,
    reminded,
    downgraded
  });
}
