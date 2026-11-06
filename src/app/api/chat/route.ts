import { NextResponse } from "next/server";
import { answerQuestion } from "@/server/assistant/service";
import { assistantDeps, requestContext } from "@/server/context";
import { env } from "@/server/env";
import { toErrorResponse } from "@/server/errors";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 20_000;

/**
 * Route handlers do not get the Origin check that Server Actions do, so apply it here: a browser POST from
 * another site is refused. Requests with no Origin (scripts) are refused too; the widget always sends one.
 */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const host = req.headers.get("host");
    return o.host === new URL(env().APP_URL).host || (host !== null && o.host === host);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "Request not allowed." } }, { status: 403 });
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Send JSON." } }, { status: 415 });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Message too large." } }, { status: 413 });
  let body: { message?: unknown; history?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Invalid JSON." } }, { status: 400 });
  }
  try {
    const reply = await answerQuestion(assistantDeps(), body ?? {}, await requestContext());
    return NextResponse.json({ ok: true, answer: reply.answer, outcome: reply.outcome }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body: errBody } = toErrorResponse(err);
    if (status >= 500) logger.error({ err }, "chat route error");
    const retry = errBody.error.retryAfterSeconds;
    return NextResponse.json({ ok: false, error: { ...errBody.error, message: errBody.error.fieldErrors?.message?.[0] ?? errBody.error.message } }, { status, headers: retry ? { "Retry-After": String(retry) } : undefined });
  }
}
