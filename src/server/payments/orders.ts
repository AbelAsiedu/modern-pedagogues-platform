import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { recordAudit } from "../audit";
import { orders, paymentAttempts, users } from "../db/schema";
import type { Db } from "../db";
import { ConflictError, NotFoundError } from "../errors";
import type { Actor } from "../permissions/authorize";
import { sendOrderPaidEmail, settleOrderPaid, type ShopDeps } from "../shop/service";
import { initializeTransaction, PaystackError, verifyTransaction, type PaystackConfig } from "./paystack";

export type PaymentDeps = ShopDeps & { paystack: PaystackConfig | null };

/**
 * Start paying an order through Paystack. Returns the Paystack page to send the buyer to. Every call makes a fresh
 * reference (Paystack rejects reused ones); whichever attempt ends up paid settles the order.
 */
export async function startPaystackCheckout(deps: PaymentDeps, actor: Actor | null, orderId: string): Promise<string> {
  if (!deps.paystack) throw new ConflictError("Online payment is not switched on yet. Please pay by Mobile Money as described on this page.");
  if (!actor || actor.status !== "ACTIVE") throw new NotFoundError("order not found");
  if (!/^[0-9a-f-]{36}$/.test(orderId)) throw new NotFoundError("order not found");
  const { db } = deps;
  const [order] = await db
    .select({ id: orders.id, reference: orders.reference, status: orders.status, amountMinor: orders.amountMinor, productTitle: orders.productTitle, email: users.email })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(and(eq(orders.id, orderId), eq(orders.userId, actor.id)))
    .limit(1);
  if (!order) throw new NotFoundError("order not found");
  if (order.status === "PAID") throw new ConflictError("This order is already paid.");
  if (order.status !== "PENDING_PAYMENT") throw new ConflictError("This order was cancelled. Order the resource again to pay for it.");

  const reference = `${order.reference}-${randomBytes(4).toString("hex")}`;
  await db.insert(paymentAttempts).values({ orderId: order.id, reference });
  const base = deps.appUrl.replace(/\/$/, "");
  let init;
  try {
    init = await initializeTransaction(deps.paystack, {
      email: order.email,
      amountMinor: order.amountMinor,
      reference,
      callbackUrl: `${base}/api/paystack/callback`,
      metadata: { order: order.reference, product: order.productTitle.slice(0, 80) },
    });
  } catch (err) {
    if (!(err instanceof PaystackError)) throw err;
    deps.log.error({ err, reference }, "paystack could not start a payment");
    throw new ConflictError("We could not open the payment page just now. Please try again, or pay by Mobile Money as described on this page.");
  }
  await recordAudit(db, { actorId: actor.id, action: "order.payment_started", entityType: "order", entityId: order.id, metadata: { reference } });
  return init.authorizationUrl;
}

export type PaymentOutcome = "paid" | "already_paid" | "pending" | "failed" | "mismatch" | "unknown";

/**
 * Settle an order from a Paystack reference. Called when the buyer comes back from Paystack and again by Paystack's
 * webhook; both are safe to repeat. The reference is never trusted on its own: Paystack is asked what happened, and
 * the order is only paid when Paystack says success, the amount equals the order's amount, and the currency is GHS.
 */
export async function completePaystackPayment(deps: PaymentDeps, reference: string): Promise<PaymentOutcome> {
  if (!deps.paystack) return "unknown";
  if (!/^[A-Za-z0-9.=-]{6,80}$/.test(reference)) return "unknown";
  const { db } = deps;
  const [attempt] = await db
    .select({ id: paymentAttempts.id, orderId: paymentAttempts.orderId, status: paymentAttempts.status, amountMinor: orders.amountMinor, orderStatus: orders.status })
    .from(paymentAttempts)
    .innerJoin(orders, eq(orders.id, paymentAttempts.orderId))
    .where(eq(paymentAttempts.reference, reference))
    .limit(1);
  if (!attempt) return "unknown";
  if (attempt.orderStatus === "PAID") return "already_paid";

  const v = await verifyTransaction(deps.paystack, reference);
  if (v.status !== "success") return v.status === "failed" || v.status === "abandoned" || v.status === "reversed" ? "failed" : "pending";
  if (v.amountMinor !== attempt.amountMinor || v.currency !== "GHS") {
    await db.update(paymentAttempts).set({ status: "MISMATCH", channel: v.channel }).where(eq(paymentAttempts.id, attempt.id));
    deps.log.error({ reference, paid: v.amountMinor.toString(), expected: attempt.amountMinor.toString(), currency: v.currency }, "paystack payment does not match the order; not settled");
    return "mismatch";
  }
  const settled = await db.transaction(async (tx) => {
    await tx.update(paymentAttempts).set({ status: "PAID", channel: v.channel, completedAt: new Date() }).where(eq(paymentAttempts.id, attempt.id));
    const paid = await settleOrderPaid(tx, attempt.orderId, { paidById: null, note: `Paystack ${reference}${v.channel ? ` (${v.channel})` : ""}`, method: "paystack", allowCancelled: true });
    if (paid) await recordAudit(tx, { actorId: null, action: "order.paid", entityType: "order", entityId: paid.id, metadata: { reference: paid.reference, via: "paystack", paystackReference: reference } });
    return paid;
  });
  if (!settled) return "already_paid";
  await sendOrderPaidEmail(deps, settled);
  return "paid";
}

export { PaystackError };
export type { Db };
