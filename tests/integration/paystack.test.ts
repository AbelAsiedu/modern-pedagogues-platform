import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listAuditLogs } from "@/server/admin/audit";
import { orders, paymentAttempts } from "@/server/db/schema";
import { MemoryMailer } from "@/server/email/mailer";
import { ConflictError, NotFoundError } from "@/server/errors";
import { createLogger } from "@/server/logger";
import { completePaystackPayment, startPaystackCheckout, type PaymentDeps } from "@/server/payments/orders";
import { attachProductFile, createProduct, getDownload, markOrderPaid, placeOrder, updateProduct } from "@/server/shop/service";
import { makeActor, openTestDb, resetData } from "../support/harness";
import { makePdf } from "../support/pdf";

const { pool, db } = openTestDb();
afterAll(() => pool.end());
beforeEach(() => resetData(db));

let PDF: Buffer;
beforeAll(async () => {
  PDF = await makePdf(3);
});
const form = { title: "BECE Maths Past Questions", summary: "Ten years of BECE Mathematics papers with worked answers.", description: "", price: "25", coverPath: "", sortOrder: "0" };

/** A fake Paystack: remembers what was started and answers verify calls from a table the test controls. */
function fakePaystack() {
  const started: { reference: string; amount: string; email: string; currency: string }[] = [];
  const verdicts = new Map<string, { status: string; amount: number; currency: string; channel?: string }>();
  let down = false;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    if (down) throw new TypeError("fetch failed");
    if (url.endsWith("/transaction/initialize")) {
      const b = JSON.parse(String(init?.body));
      started.push({ reference: b.reference, amount: b.amount, email: b.email, currency: b.currency });
      return new Response(JSON.stringify({ status: true, data: { authorization_url: `https://checkout.paystack.com/${b.reference}`, reference: b.reference } }));
    }
    const ref = decodeURIComponent(url.split("/transaction/verify/")[1]!);
    const v = verdicts.get(ref) ?? { status: "abandoned", amount: 0, currency: "GHS" };
    return new Response(JSON.stringify({ status: true, data: { reference: ref, ...v } }));
  }) as unknown as typeof fetch;
  return { started, verdicts, fetchImpl, setDown: (d: boolean) => (down = d) };
}

function deps(f: ReturnType<typeof fakePaystack> | null): PaymentDeps & { mailer: MemoryMailer } {
  const mailer = new MemoryMailer();
  return { db, mailer, log: createLogger("silent"), appUrl: "https://tmp.example", notifyEmail: "inbox@tmp.example", paystack: f ? { secretKey: "sk_test_abcdefgh1234", apiUrl: "https://api.paystack.co", fetchImpl: f.fetchImpl } : null };
}

async function setup(price = "25") {
  const admin = await makeActor(db, "a@example.com", ["admin"]);
  const buyer = await makeActor(db, "b@example.com", []);
  const id = await createProduct(db, admin, { ...form, price });
  await attachProductFile(db, admin, id, { filename: "maths.pdf", bytes: PDF });
  await updateProduct(db, admin, id, { ...form, price, isPublished: true });
  const d = deps(null);
  const { order } = await placeOrder(d, buyer, "bece-maths-past-questions");
  return { admin, buyer, order };
}

describe("paying through Paystack", () => {
  it("starts a payment for the buyer's own order in pesewas, with the buyer's email, and does not settle anything yet", async () => {
    const { buyer, order } = await setup();
    const f = fakePaystack();
    const url = await startPaystackCheckout(deps(f), buyer, order.id);
    expect(url).toMatch(/^https:\/\/checkout\.paystack\.com\/TMP-[A-Z0-9]{6}-[0-9a-f]{8}$/);
    expect(f.started).toEqual([{ reference: expect.stringMatching(new RegExp(`^${order.reference}-`)), amount: "2500", email: "b@example.com", currency: "GHS" }]);
    expect((await db.select().from(orders).where(eq(orders.id, order.id)))[0]!.status).toBe("PENDING_PAYMENT");
    // a second click gets a new reference, because Paystack refuses reused ones
    await startPaystackCheckout(deps(f), buyer, order.id);
    expect(new Set(f.started.map((s) => s.reference)).size).toBe(2);
    expect(await db.select().from(paymentAttempts)).toHaveLength(2);
  });

  it("only lets the buyer pay their own live order, and only when Paystack is switched on", async () => {
    const { buyer, order } = await setup();
    const other = await makeActor(db, "o@example.com", []);
    const f = fakePaystack();
    await expect(startPaystackCheckout(deps(f), other, order.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(startPaystackCheckout(deps(f), null, order.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(startPaystackCheckout(deps(f), buyer, "not-an-id")).rejects.toBeInstanceOf(NotFoundError);
    await expect(startPaystackCheckout(deps(null), buyer, order.id)).rejects.toBeInstanceOf(ConflictError);
    await db.update(orders).set({ status: "CANCELLED" }).where(eq(orders.id, order.id));
    await expect(startPaystackCheckout(deps(f), buyer, order.id)).rejects.toBeInstanceOf(ConflictError);
    expect(f.started).toHaveLength(0);
  });

  it("explains a Paystack outage in plain words instead of crashing", async () => {
    const { buyer, order } = await setup();
    const f = fakePaystack();
    f.setDown(true);
    await expect(startPaystackCheckout(deps(f), buyer, order.id)).rejects.toThrow(/could not open the payment page/);
  });

  it("unlocks the download, emails the buyer and records the payment when Paystack confirms the right amount", async () => {
    const { buyer, order } = await setup();
    const f = fakePaystack();
    const d = deps(f);
    await startPaystackCheckout(d, buyer, order.id);
    const ref = f.started[0]!.reference;
    expect(await getDownload(db, buyer, order.id)).toBeNull();

    f.verdicts.set(ref, { status: "success", amount: 2500, currency: "GHS", channel: "mobile_money" });
    expect(await completePaystackPayment(d, ref)).toBe("paid");
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row).toMatchObject({ status: "PAID", paymentMethod: "paystack", paidById: null, paymentNote: `Paystack ${ref} (mobile_money)` });
    expect((await getDownload(db, buyer, order.id))?.filename).toBe("maths.pdf");
    expect(d.mailer.sent.filter((m) => m.subject.startsWith("Payment received"))).toHaveLength(1);
    const boss = await makeActor(db, "boss@example.com", ["super_admin"]);
    expect((await listAuditLogs(db, boss)).map((r) => r.action)).toEqual(expect.arrayContaining(["order.payment_started", "order.paid"]));
  });

  it("is safe to repeat: the callback and the webhook both arriving settle once and email once", async () => {
    const { buyer, order } = await setup();
    const f = fakePaystack();
    const d = deps(f);
    await startPaystackCheckout(d, buyer, order.id);
    const ref = f.started[0]!.reference;
    f.verdicts.set(ref, { status: "success", amount: 2500, currency: "GHS" });
    const results = await Promise.all([completePaystackPayment(d, ref), completePaystackPayment(d, ref), completePaystackPayment(d, ref)]);
    expect(results.filter((r) => r === "paid")).toHaveLength(1);
    expect(await completePaystackPayment(d, ref)).toBe("already_paid");
    expect(d.mailer.sent.filter((m) => m.subject.startsWith("Payment received"))).toHaveLength(1);
  });

  it("does not unlock anything for a payment that is pending, failed, for the wrong amount or the wrong currency", async () => {
    const { buyer, order } = await setup();
    const f = fakePaystack();
    const d = deps(f);
    await startPaystackCheckout(d, buyer, order.id);
    const ref = f.started[0]!.reference;
    expect(await completePaystackPayment(d, ref)).toBe("failed"); // abandoned
    f.verdicts.set(ref, { status: "ongoing", amount: 2500, currency: "GHS" });
    expect(await completePaystackPayment(d, ref)).toBe("pending");
    f.verdicts.set(ref, { status: "failed", amount: 0, currency: "GHS" });
    expect(await completePaystackPayment(d, ref)).toBe("failed");
    f.verdicts.set(ref, { status: "success", amount: 100, currency: "GHS" }); // paid GHS 1 for a GHS 25 order
    expect(await completePaystackPayment(d, ref)).toBe("mismatch");
    f.verdicts.set(ref, { status: "success", amount: 2500, currency: "NGN" });
    expect(await completePaystackPayment(d, ref)).toBe("mismatch");
    expect((await db.select().from(orders).where(eq(orders.id, order.id)))[0]!.status).toBe("PENDING_PAYMENT");
    expect((await db.select().from(paymentAttempts))[0]!.status).toBe("MISMATCH");
    // the right payment on the same attempt still works afterwards
    f.verdicts.set(ref, { status: "success", amount: 2500, currency: "GHS" });
    expect(await completePaystackPayment(d, ref)).toBe("paid");
  });

  it("ignores references it never issued, and does nothing when Paystack is off", async () => {
    const { buyer, order } = await setup();
    const f = fakePaystack();
    f.verdicts.set(order.reference, { status: "success", amount: 2500, currency: "GHS" });
    expect(await completePaystackPayment(deps(f), order.reference)).toBe("unknown"); // the bare TMP- code is not an attempt
    expect(await completePaystackPayment(deps(f), "x")).toBe("unknown");
    expect(await completePaystackPayment(deps(f), "../etc/passwd")).toBe("unknown");
    await startPaystackCheckout(deps(f), buyer, order.id);
    expect(await completePaystackPayment(deps(null), f.started[0]!.reference)).toBe("unknown");
    expect((await db.select().from(orders).where(eq(orders.id, order.id)))[0]!.status).toBe("PENDING_PAYMENT");
  });

  it("still settles a payment that arrives after the buyer cancelled the order, and never pays a different order", async () => {
    const { buyer, order } = await setup();
    const f = fakePaystack();
    const d = deps(f);
    await startPaystackCheckout(d, buyer, order.id);
    await db.update(orders).set({ status: "CANCELLED", cancelledAt: new Date() }).where(eq(orders.id, order.id));
    const ref = f.started[0]!.reference;
    f.verdicts.set(ref, { status: "success", amount: 2500, currency: "GHS" });
    expect(await completePaystackPayment(d, ref)).toBe("paid");
    expect((await db.select().from(orders).where(eq(orders.id, order.id)))[0]).toMatchObject({ status: "PAID", cancelledAt: null });
  });

  it("splits a creator's sale the same way as a hand-confirmed one", async () => {
    const creator = await makeActor(db, "c@example.com", ["parent"]);
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const buyer = await makeActor(db, "b@example.com", []);
    const id = await createProduct(db, admin, { ...form, price: "100" });
    await attachProductFile(db, admin, id, { filename: "m.pdf", bytes: PDF });
    await updateProduct(db, admin, id, { ...form, price: "100", isPublished: true });
    const { products } = await import("@/server/db/schema");
    await db.update(products).set({ ownerId: creator.id }).where(eq(products.id, id));
    const { order } = await placeOrder(deps(null), buyer, "bece-maths-past-questions");
    const f = fakePaystack();
    const d = deps(f);
    await startPaystackCheckout(d, buyer, order.id);
    f.verdicts.set(f.started[0]!.reference, { status: "success", amount: 10000, currency: "GHS" });
    await completePaystackPayment(d, f.started[0]!.reference);
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row).toMatchObject({ status: "PAID", creatorId: creator.id, commissionBps: 3000, creatorShareMinor: 7000n, platformShareMinor: 3000n });
  });

  it("keeps hand confirmation working and labels it as manual", async () => {
    const { admin, order } = await setup();
    await markOrderPaid(deps(null), admin, order.id, "MoMo-123456");
    expect((await db.select().from(orders).where(eq(orders.id, order.id)))[0]).toMatchObject({ status: "PAID", paymentMethod: "manual", paidById: admin.id });
    await expect(markOrderPaid(deps(null), admin, order.id, "MoMo-123456")).rejects.toBeInstanceOf(ConflictError);
  });
});
