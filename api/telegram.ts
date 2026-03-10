import { getBot } from "../src/bot.js";
import { getWebhookSecret } from "../src/config.js";

export function GET(): Response {
  return Response.json({
    ok: true,
    endpoint: "/api/telegram",
    status: "healthy",
  });
}

export async function POST(request: Request): Promise<Response> {
  const secret = getWebhookSecret();
  if (secret) {
    const incoming = request.headers.get("x-telegram-bot-api-secret-token");
    if (incoming !== secret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const bot = getBot();
    await bot.init();
    const update = await request.json();
    await bot.handleUpdate(update);
  } catch (error) {
    console.error("telegram-webhook-error", error);
  }

  return Response.json({ ok: true });
}
