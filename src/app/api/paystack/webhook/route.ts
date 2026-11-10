import { NextResponse, type NextRequest } from "next/server";
import { paymentDeps } from "@/server/context";
import { logger } from "@/server/logger";
import { completePaystackPayment } from "@/server/payments/orders";
import { signatureValid } from "@/server/payments/paystack";

export const dynamic = "force-dynamic";

/**
 * Paystack tells us about payments here (so an order is still settled if the buyer closes the tab). The body is only
 * read once its signature checks out; the payment itself is then re-verified with Paystack before anything is marked paid.
 * Replies 200 once handled (including repeats and unknown references) and 500 on a temporary failure so Paystack retries.
 */
export async function POST(req: NextRequest) {
  const deps = paymentDeps();
  if (!deps.paystack) return new NextResponse(null, { status: 404 });
  const raw = await req.text();
  if (raw.length > 100_000 || !signatureValid(raw, req.headers.get("x-paystack-signature"), deps.paystack.secretKey)) {
    return new NextResponse(null, { status: 401 });
  }
  let event: { event?: unknown; data?: { reference?: unknown } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (event.event !== "charge.success" || typeof event.data?.reference !== "string") return NextResponse.json({ received: true });
  try {
    const outcome = await completePaystackPayment(deps, event.data.reference);
    return NextResponse.json({ received: true, outcome });
  } catch (err) {
    logger.error({ err }, "paystack webhook could not be processed");
    return new NextResponse(null, { status: 500 });
  }
}
