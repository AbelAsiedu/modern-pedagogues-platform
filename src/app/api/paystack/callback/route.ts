import { NextResponse, type NextRequest } from "next/server";
import { paymentDeps } from "@/server/context";
import { env } from "@/server/env";
import { completePaystackPayment, PaystackError } from "@/server/payments/orders";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

/**
 * Where Paystack sends the buyer after paying. The address carries a reference, but the reference alone proves nothing:
 * we ask Paystack what happened, then show the buyer their orders. Safe to open twice.
 */
export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference") ?? req.nextUrl.searchParams.get("trxref") ?? "";
  const base = env().APP_URL;
  let outcome = "unknown";
  try {
    outcome = await completePaystackPayment(paymentDeps(), reference);
  } catch (err) {
    if (!(err instanceof PaystackError)) logger.error({ err }, "paystack callback failed");
    outcome = "pending";
  }
  const state = outcome === "paid" || outcome === "already_paid" ? "paid" : outcome === "failed" ? "failed" : outcome === "mismatch" ? "check" : "pending";
  return NextResponse.redirect(new URL(`/account/orders?payment=${state}`, base), { status: 303, headers: { "Cache-Control": "no-store" } });
}
