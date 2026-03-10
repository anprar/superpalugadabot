import { Client } from "@upstash/qstash";
import { ACTION_POLICIES, getPublicBaseUrl, getQStashConfig } from "./config.js";
import { patchChatSession, consumeActionQuota, tryAcquireJobLock } from "./sessions.js";
import type { MailJobPayload, MailJobType } from "./types.js";

let qstashClient: Client | undefined;

function getQStashClient(): Client {
  if (!qstashClient) {
    const config = getQStashConfig();
    qstashClient = new Client({ token: config.token });
  }

  return qstashClient;
}

export async function enqueueMailJob(payload: MailJobPayload): Promise<{ ok: true; jobId: string } | { ok: false; reason: string }> {
  const policy = ACTION_POLICIES[payload.type];
  const quota = await consumeActionQuota(payload.chatId, payload.type, policy.limit, policy.windowSeconds);
  if (!quota.allowed) {
    return {
      ok: false,
      reason: `Rate limit hit. Retry in about ${quota.retryAfterSeconds}s.`
    };
  }

  const locked = await tryAcquireJobLock(payload.chatId, payload.type, policy.lockSeconds);
  if (!locked) {
    return {
      ok: false,
      reason: "A similar job is already running for this user."
    };
  }

  const jobUrl = `${getPublicBaseUrl()}/api/jobs/mailticking`;
  const response = await getQStashClient().publishJSON({
    url: jobUrl,
    body: payload
  });

  await patchChatSession(payload.chatId, (current) => ({
    ...current,
    pendingJob: {
      id: response.messageId,
      type: payload.type,
      requestedAt: payload.requestedAt
    }
  }));

  return {
    ok: true,
    jobId: response.messageId
  };
}

export function isMailJobType(value: string): value is MailJobType {
  return value === "generate" || value === "refresh";
}
