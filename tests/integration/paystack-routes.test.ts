import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { orders } from "@/server/db/schema";
import { MemoryMailer } from "@/server/email/mailer";
import { createLogger } from "@/server/logger";
import { startPaystackCheckout, type PaymentDeps } from "@/server/payments/orders";
import { attachProductFile, createProduct, placeOrder, updateProduct } from "@/server/shop/service";
import { makeActor, openTestDb, resetData } from "../support/harness";
import { makePdf } from "../support/pdf";

const { pool, db } = openTestDb();
afterAll(() => pool.end());
beforeEach(() => resetData(db));

const KEY = "sk_test_abcdefgh1234";
const state: { verdicts: Map<string, { status: string; amount: number; currency: string }>; enabled: boolean; down: boolean; started: string[] } = { verdicts: new Map(), enabled: true, down: false, started: [] };
const fetchImpl = (async (url: string, init?: RequestInit) => {
  if (state.down) throw new TypeError("fetch failed");
  if (url.endsWith("/transaction/initialize")) {
    const b = JSON.parse(String(init?.body));
    state.started.push(b.reference);
    return new Response(JSON.stringify({ status: true, data: { authorization_url: `https://checkout.paystack.com/${b.reference}`, reference: b.reference } }));
  }
  const ref = decodeURIComponent(url.split("/transaction/verify/")[1]!);
  return new Response(JSON.stringify({ status: true, data: { reference: ref, ...(state.verdicts.get(ref) ?? { status: "abandoned", amount: 0, currency: "GHS" }) } }));
}) as unknown as typeof fetch;
const mailer = new MemoryMailer();
const makeDeps = (): PaymentDeps => ({ db, mailer, log: createLogger("silent"), appUrl: "https://tmp.example", paystack: state.enabled ? { secretKey: KEY, apiUrl: "https://api.paystack.co", fetchImpl } : null });

vi.mock("@/server/context", () => ({ paymentDeps: () => makeDeps() }));
vi.mock("@/server/env", () => ({ env: () => ({ APP_URL: "https://tmp.example" }) }));

const { POST } = await import("@/app/api/paystack/webhook/route");
const { GET } = await import("@/app/api/paystack/callback/route");

const sign = (raw: string, key = KEY) => createHmac("sha512", key).update(raw).digest("hex");
const hook = (raw: string, signature: string | null) =>
  POST(new NextRequest("https://tmp.example/api/paystack/webhook", { method: "POST", body: raw, headers: signature ? { "x-paystack-signature": signature } : {} }));
const charge = (reference: string) => JSON.stringify({ event: "charge.success", data: { reference } });

async function pendingPayment() {
  state.verdicts.clear();
  state.started = [];
  state.enabled = true;
  state.down = false;
  const admin = await makeActor(db, "a@example.com", ["admin"]);
  const buyer = await makeActor(db, "b@example.com", []);
  const form = { title: "BECE Maths Past Questions", summary: "Ten years of BECE Mathematics papers with worked answers.", description: "", price: "25", coverPath: "", sortOrder: "0" };
  const id = await createProduct(db, admin, form);
  await attachProductFile(db, admin, id, { filename: "m.pdf", bytes: await makePdf(2) });
  await updateProduct(db, admin, id, { ...form, isPublished: true });
  const { order } = await placeOrder(makeDeps() as never, buyer, "bece-maths-past-questions");
  await startPaystackCheckout(makeDeps(), buyer, order.id);
  return { order, reference: state.started[0]! };
}
const status = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0]!.status;

describe("Paystack webhook", () => {
  it("rejects anything not signed with our secret key, before reading it", async () => {
    const { order, reference } = await pendingPayment();
    state.verdicts.set(reference, { status: "success", amount: 2500, currency: "GHS" });
    const raw = charge(reference);
    expect((await hook(raw, null)).status).toBe(401);
    expect((await hook(raw, "00".repeat(64))).status).toBe(401);
    expect((await hook(raw, sign(raw, "sk_test_someoneelse1234"))).status).toBe(401);
    expect((await hook(raw + " ", sign(raw))).status).toBe(401);
    expect(await status(order.id)).toBe("PENDING_PAYMENT");
  });

  it("settles the order once on a signed charge.success, and answers repeats with 200", async () => {
    const { order, reference } = await pendingPayment();
    state.verdicts.set(reference, { status: "success", amount: 2500, currency: "GHS" });
    const raw = charge(reference);
    const a = await hook(raw, sign(raw));
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual({ received: true, outcome: "paid" });
    expect(await status(order.id)).toBe("PAID");
    expect(await (await hook(raw, sign(raw))).json()).toEqual({ received: true, outcome: "already_paid" });
  });

  it("does not trust the webhook body's claim: a signed event for an unpaid reference settles nothing", async () => {
    const { order, reference } = await pendingPayment();
    const raw = charge(reference); // Paystack's own verify says abandoned
    expect((await hook(raw, sign(raw))).status).toBe(200);
    expect(await status(order.id)).toBe("PENDING_PAYMENT");
  });

  it("ignores other events, answers 400 to junk and 404 when Paystack is off, and asks Paystack to retry on an outage", async () => {
    const { order, reference } = await pendingPayment();
    const other = JSON.stringify({ event: "charge.failed", data: { reference } });
    expect(await (await hook(other, sign(other))).json()).toEqual({ received: true });
    expect((await hook("not json", sign("not json"))).status).toBe(400);
    state.verdicts.set(reference, { status: "success", amount: 2500, currency: "GHS" });
    state.down = true;
    expect((await hook(charge(reference), sign(charge(reference)))).status).toBe(500);
    expect(await status(order.id)).toBe("PENDING_PAYMENT");
    state.down = false;
    state.enabled = false;
    expect((await hook(charge(reference), sign(charge(reference)))).status).toBe(404);
  });
});

describe("Paystack callback", () => {
  const back = async (q: string) => {
    const res = await GET(new NextRequest(`https://tmp.example/api/paystack/callback?${q}`));
    return { status: res.status, to: res.headers.get("location") };
  };

  it("settles a paid reference and sends the buyer to their orders", async () => {
    const { order, reference } = await pendingPayment();
    state.verdicts.set(reference, { status: "success", amount: 2500, currency: "GHS" });
    expect(await back(`reference=${reference}&trxref=${reference}`)).toEqual({ status: 303, to: "https://tmp.example/account/orders?payment=paid" });
    expect(await status(order.id)).toBe("PAID");
    expect((await back(`trxref=${reference}`)).to).toContain("payment=paid"); // opening it twice is fine
  });

  it("tells the buyer when a payment failed, is still pending, or does not match; junk is treated as pending", async () => {
    const { order, reference } = await pendingPayment();
    expect((await back(`reference=${reference}`)).to).toContain("payment=failed");
    state.verdicts.set(reference, { status: "ongoing", amount: 2500, currency: "GHS" });
    expect((await back(`reference=${reference}`)).to).toContain("payment=pending");
    state.verdicts.set(reference, { status: "success", amount: 1, currency: "GHS" });
    expect((await back(`reference=${reference}`)).to).toContain("payment=check");
    expect((await back("reference=")).to).toContain("payment=pending");
    expect((await back("reference=%3Cscript%3E")).to).toContain("payment=pending");
    state.down = true;
    expect((await back(`reference=${reference}`)).to).toContain("payment=pending");
    expect(await status(order.id)).toBe("PENDING_PAYMENT");
  });
});
