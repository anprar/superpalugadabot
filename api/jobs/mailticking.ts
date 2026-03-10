import { Receiver } from "@upstash/qstash";
import { getQStashConfig } from "../../src/config.js";
import { runMailJob } from "../../src/jobs.js";
import type { MailJobPayload } from "../../src/types.js";

let receiver: Receiver | undefined;

function getReceiver(): Receiver {
  if (!receiver) {
    const config = getQStashConfig();
    receiver = new Receiver({
      currentSigningKey: config.currentSigningKey,
      nextSigningKey: config.nextSigningKey
    });
  }

  return receiver;
}

export function GET(): Response {
  return Response.json({
    ok: true,
    endpoint: "/api/jobs/mailticking",
    status: "healthy"
  });
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("upstash-signature") ?? request.headers.get("Upstash-Signature");

  if (!signature) {
    return new Response("Missing Upstash signature", { status: 401 });
  }

  try {
    const isValid = await getReceiver().verify({
      body: rawBody,
      signature,
      url: request.url
    });

    if (!isValid) {
      return new Response("Invalid signature", { status: 401 });
    }
  } catch (error) {
    console.error("qstash-signature-error", error);
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody) as MailJobPayload;
    await runMailJob(payload);
  } catch (error) {
    console.error("mailticking-job-error", error);
  }

  return Response.json({ ok: true });
}
