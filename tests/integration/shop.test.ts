import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listAuditLogs } from "@/server/admin/audit";
import { orders, productFiles, products } from "@/server/db/schema";
import { MemoryMailer } from "@/server/email/mailer";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { createLogger } from "@/server/logger";
import { deleteMedia, saveImage } from "@/server/media/service";
import {
  attachProductFile,
  cancelMyOrder,
  cancelOrderByStaff,
  createProduct,
  deleteProduct,
  getDownload,
  getPublicProduct,
  listMyOrders,
  listOrders,
  listProducts,
  listPublicProducts,
  markOrderPaid,
  placeOrder,
  updateProduct,
  type ShopDeps,
} from "@/server/shop/service";
import { makeActor, openTestDb, resetData } from "../support/harness";
import { makePdf } from "../support/pdf";

const { pool, db } = openTestDb();
afterAll(() => pool.end());
beforeEach(() => resetData(db));

function deps(): ShopDeps & { mailer: MemoryMailer } {
  const mailer = new MemoryMailer();
  return { db, mailer, log: createLogger("silent"), appUrl: "https://tmp.example", notifyEmail: "inbox@tmp.example" };
}
let PDF: Buffer;
beforeAll(async () => {
  PDF = await makePdf(5);
});
const form = { title: "BECE Maths Past Questions", summary: "Ten years of BECE Mathematics papers with worked answers.", description: "Inside: papers.", price: "25", coverPath: "", sortOrder: "0" };

/** A published product with a PDF, created by `admin`. */
async function publishedProduct(admin: Awaited<ReturnType<typeof makeActor>>, over: Partial<typeof form> = {}) {
  const id = await createProduct(db, admin, { ...form, ...over });
  await attachProductFile(db, admin, id, { filename: "maths.pdf", bytes: PDF });
  await updateProduct(db, admin, id, { ...form, ...over, isPublished: true });
  return id;
}

describe("products", () => {
  it("can only be managed by staff with the products permission", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const id = await createProduct(db, admin, form);
    const outsiders = [
      await makeActor(db, "c@example.com", ["content_manager"]),
      await makeActor(db, "f@example.com", ["finance_manager"]),
      await makeActor(db, "p@example.com", ["parent"]),
      await makeActor(db, "s@example.com", ["admin"], "SUSPENDED"),
      null,
    ];
    for (const who of outsiders) {
      await expect(createProduct(db, who, form)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updateProduct(db, who, id, form)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(deleteProduct(db, who, id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listProducts(db, who)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(attachProductFile(db, who, id, { filename: "x.pdf", bytes: PDF })).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("cannot be published until a PDF is attached, and the database agrees", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    await expect(createProduct(db, admin, { ...form, isPublished: true })).rejects.toBeInstanceOf(ValidationError);
    const id = await createProduct(db, admin, form);
    await expect(updateProduct(db, admin, id, { ...form, isPublished: true })).rejects.toBeInstanceOf(ValidationError);
    await expect(db.update(products).set({ isPublished: true }).where(eq(products.id, id))).rejects.toThrow();
    await attachProductFile(db, admin, id, { filename: "maths.pdf", bytes: PDF });
    await updateProduct(db, admin, id, { ...form, isPublished: true });
    expect(await listPublicProducts(db)).toHaveLength(1);
  });

  it("stores prices exactly in pesewas and generates unique slugs", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const a = await createProduct(db, admin, { ...form, price: "25.50" });
    const b = await createProduct(db, admin, { ...form, price: "30" });
    const rows = await listProducts(db, admin);
    const slugs = rows.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(2);
    expect(rows.find((r) => r.id === a)?.priceMinor).toBe(2550n);
    expect(rows.find((r) => r.id === b)?.priceMinor).toBe(3000n);
  });

  it("accepts only real PDFs and replaces the old file instead of piling them up", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const id = await createProduct(db, admin, form);
    for (const bad of [Buffer.from("<html>nope</html>"), Buffer.alloc(0), await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).png().toBuffer()]) {
      await expect(attachProductFile(db, admin, id, { filename: "x.pdf", bytes: bad })).rejects.toMatchObject({ code: "VALIDATION" });
    }
    await expect(attachProductFile(db, admin, id, { filename: "x.pdf", bytes: Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(15 * 1024 * 1024)]) })).rejects.toMatchObject({ code: "VALIDATION" });
    await attachProductFile(db, admin, id, { filename: "first.pdf", bytes: PDF });
    await attachProductFile(db, admin, id, { filename: "../second<>.pdf", bytes: Buffer.concat([PDF, Buffer.from("more")]) });
    const files = await db.select().from(productFiles);
    expect(files).toHaveLength(1);
    expect(files[0]?.filename).toBe("second.pdf");
    await expect(attachProductFile(db, admin, "00000000-0000-7000-8000-000000000000", { filename: "x.pdf", bytes: PDF })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("shows the public only the safe fields of published products", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    await createProduct(db, admin, { ...form, title: "Hidden draft one" });
    const id = await publishedProduct(admin);
    const [p] = await listPublicProducts(db);
    expect(Object.keys(p!).sort()).toEqual([
      "audience", "authorName", "coverPath", "curriculumKeys", "description", "id", "kind", "language", "levelKeys", "outcomes", "pageCount", "priceMinor", "slug", "subject", "summary", "tableOfContents", "title",
    ]);
    expect(await getPublicProduct(db, p!.slug)).not.toBeNull();
    expect(await getPublicProduct(db, "hidden-draft-one")).toBeNull();
    expect(await getPublicProduct(db, "../etc/passwd")).toBeNull();
    await updateProduct(db, admin, id, { ...form, isPublished: false });
    expect(await listPublicProducts(db)).toHaveLength(0);
  });

  it("cannot be deleted once ordered, but can be hidden; an unordered one is deleted with its file", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const buyer = await makeActor(db, "b@example.com", ["parent"]);
    const ordered = await publishedProduct(admin);
    const [pub] = await listPublicProducts(db);
    await placeOrder(deps(), buyer, pub!.slug);
    await expect(deleteProduct(db, admin, ordered)).rejects.toBeInstanceOf(ConflictError);

    const spare = await createProduct(db, admin, { ...form, title: "Spare resource" });
    await attachProductFile(db, admin, spare, { filename: "spare.pdf", bytes: PDF });
    await deleteProduct(db, admin, spare);
    expect(await db.select().from(productFiles)).toHaveLength(1);
  });

  it("keeps a cover picture from being deleted while a product uses it", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const pic = await saveImage(db, admin, { filename: "cover.png", bytes: await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer() });
    const id = await createProduct(db, admin, { ...form, coverPath: pic.path });
    const mediaId = pic.id;
    await expect(deleteMedia(db, admin, mediaId)).rejects.toBeInstanceOf(ConflictError);
    await deleteProduct(db, admin, id);
    await deleteMedia(db, admin, mediaId);
  });
});

describe("orders", () => {
  it("needs a signed-in, active account and a published product", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    await publishedProduct(admin);
    const [p] = await listPublicProducts(db);
    const d = deps();
    await expect(placeOrder(d, null, p!.slug)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(placeOrder(d, await makeActor(db, "s@example.com", ["parent"], "SUSPENDED"), p!.slug)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(placeOrder(d, await makeActor(db, "u@example.com", ["parent"], "PENDING_VERIFICATION"), p!.slug)).rejects.toBeInstanceOf(ForbiddenError);
    const buyer = await makeActor(db, "b@example.com", ["parent"]);
    await expect(placeOrder(d, buyer, "no-such-product")).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it("creates one order with a reference, copies the price, and emails the buyer and TMP", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const id = await publishedProduct(admin);
    const [p] = await listPublicProducts(db);
    const buyer = await makeActor(db, "kofi@example.com", ["parent"], "ACTIVE", "Kofi Boateng");
    const d = deps();
    const { order, created } = await placeOrder(d, buyer, p!.slug);
    expect(created).toBe(true);
    expect(order.reference).toMatch(/^TMP-[A-HJKMNP-Z2-9]{6}$/);
    expect(order).toMatchObject({ amountMinor: 2500n, status: "PENDING_PAYMENT", productTitle: "BECE Maths Past Questions" });

    expect(d.mailer.sent.map((m) => m.to).sort()).toEqual(["inbox@tmp.example", "kofi@example.com"]);
    const toBuyer = d.mailer.sent.find((m) => m.to === "kofi@example.com")!;
    expect(toBuyer.text).toContain(order.reference);
    expect(toBuyer.text).toContain("GH₵ 25.00");
    expect(toBuyer.text).toContain("+233 59 366 0708");
    expect(toBuyer.text).not.toMatch(/api\/downloads/);

    // The agreed price never changes when the product is edited later.
    await updateProduct(db, admin, id, { ...form, price: "99", isPublished: true });
    const [mine] = await listMyOrders(db, buyer);
    expect(mine?.amountMinor).toBe(2500n);
  });

  it("is idempotent: ordering again returns the same order and sends nothing more", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    await publishedProduct(admin);
    const [p] = await listPublicProducts(db);
    const buyer = await makeActor(db, "b@example.com", ["parent"]);
    const d = deps();
    const first = await placeOrder(d, buyer, p!.slug);
    const sent = d.mailer.sent.length;
    const second = await placeOrder(d, buyer, p!.slug);
    expect(second.created).toBe(false);
    expect(second.order.id).toBe(first.order.id);
    expect(d.mailer.sent.length).toBe(sent);
    // Two clicks at the same instant also give one order.
    const both = await Promise.all([placeOrder(deps(), buyer, p!.slug), placeOrder(deps(), buyer, p!.slug)]);
    expect(new Set(both.map((r) => r.order.id)).size).toBe(1);
    expect(await db.select().from(orders)).toHaveLength(1);
  });

  it("limits how many unpaid orders one account can hold", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const buyer = await makeActor(db, "b@example.com", ["parent"]);
    const slugs: string[] = [];
    for (let i = 0; i < 6; i++) {
      await publishedProduct(admin, { title: `Resource number ${i + 1}` });
    }
    for (const p of await listPublicProducts(db)) slugs.push(p.slug);
    for (const slug of slugs.slice(0, 5)) await placeOrder(deps(), buyer, slug);
    await expect(placeOrder(deps(), buyer, slugs[5]!)).rejects.toBeInstanceOf(ConflictError);
  });

  it("lets a buyer cancel an unpaid order and order again, but never someone else's or a paid one", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    await publishedProduct(admin);
    const [p] = await listPublicProducts(db);
    const buyer = await makeActor(db, "b@example.com", ["parent"]);
    const other = await makeActor(db, "o@example.com", ["parent"]);
    const { order } = await placeOrder(deps(), buyer, p!.slug);

    await expect(cancelMyOrder(db, other, order.id)).rejects.toBeInstanceOf(NotFoundError);
    await cancelMyOrder(db, buyer, order.id);
    const again = await placeOrder(deps(), buyer, p!.slug);
    expect(again.created).toBe(true);
    expect(again.order.id).not.toBe(order.id);

    await markOrderPaid(deps(), admin, again.order.id, "MP240101.1234.A56789");
    await expect(cancelMyOrder(db, buyer, again.order.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(cancelOrderByStaff(db, admin, again.order.id)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("payment confirmation and downloads", () => {
  async function setup() {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    await publishedProduct(admin);
    const [p] = await listPublicProducts(db);
    const buyer = await makeActor(db, "b@example.com", ["parent"], "ACTIVE", "Ama Buyer");
    const { order } = await placeOrder(deps(), buyer, p!.slug);
    return { admin, buyer, order, slug: p!.slug };
  }

  it("gives the buyer no download until payment is confirmed, then the real file, and no one else", async () => {
    const { admin, buyer, order } = await setup();
    const stranger = await makeActor(db, "x@example.com", ["parent"]);
    expect(await getDownload(db, buyer, order.id)).toBeNull();

    const d = deps();
    await markOrderPaid(d, admin, order.id, "MP240101.1234.A56789", "203.0.113.5");
    const file = await getDownload(db, buyer, order.id);
    expect(file?.contentType).toBe("application/pdf");
    expect(file?.data.equals(PDF)).toBe(true);

    expect(await getDownload(db, stranger, order.id)).toBeNull();
    expect(await getDownload(db, null, order.id)).toBeNull();
    expect(await getDownload(db, await makeActor(db, "s@example.com", ["parent"], "SUSPENDED"), order.id)).toBeNull();
    expect(await getDownload(db, admin, order.id)).not.toBeNull();
    expect(await getDownload(db, buyer, "not-a-uuid")).toBeNull();

    const mail = d.mailer.last()!;
    expect(mail.to).toBe("b@example.com");
    expect(mail.subject).toContain("Payment received");
    expect(mail.text).toContain("https://tmp.example/account/orders");
  });

  it("requires proof of payment and the right permission, and a second confirmation changes nothing", async () => {
    const { admin, buyer, order } = await setup();
    await expect(markOrderPaid(deps(), admin, order.id, "")).rejects.toBeInstanceOf(ValidationError);
    await expect(markOrderPaid(deps(), admin, order.id, "ab")).rejects.toBeInstanceOf(ValidationError);
    for (const who of [buyer, await makeActor(db, "c@example.com", ["content_manager"]), await makeActor(db, "t@example.com", ["tutor"]), null]) {
      await expect(markOrderPaid(deps(), who, order.id, "MP240101.1234.A56789")).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect((await db.select().from(orders))[0]?.status).toBe("PENDING_PAYMENT");

    const finance = await makeActor(db, "f@example.com", ["finance_manager"]);
    await markOrderPaid(deps(), finance, order.id, "MP240101.1234.A56789");
    const d = deps();
    await expect(markOrderPaid(d, admin, order.id, "SOMETHING-ELSE")).rejects.toBeInstanceOf(ConflictError);
    expect(d.mailer.sent).toHaveLength(0);
    const [row] = await db.select().from(orders);
    expect(row).toMatchObject({ status: "PAID", paymentNote: "MP240101.1234.A56789", paidById: finance.id });
  });

  it("serialises two staff confirming at once: exactly one wins and the buyer gets one email", async () => {
    const { admin, order } = await setup();
    const other = await makeActor(db, "f@example.com", ["finance_manager"]);
    const d1 = deps();
    const d2 = deps();
    const results = await Promise.allSettled([markOrderPaid(d1, admin, order.id, "TXN-ONE-1234"), markOrderPaid(d2, other, order.id, "TXN-TWO-5678")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(d1.mailer.sent.length + d2.mailer.sent.length).toBe(1);
  });

  it("audits order events with the reference but not the buyer's details", async () => {
    const { admin, order } = await setup();
    await markOrderPaid(deps(), admin, order.id, "MP240101.1234.A56789");
    const boss = await makeActor(db, "boss@example.com", ["super_admin"]);
    const entries = (await listAuditLogs(db, boss)).filter((r) => r.action.startsWith("order."));
    expect(entries.map((e) => e.action).sort()).toEqual(["order.paid", "order.placed"]);
    expect(JSON.stringify(entries.map((e) => e.metadata))).not.toContain("b@example.com");
    expect(JSON.stringify(entries.map((e) => e.metadata))).toContain(order.reference);
  });

  it("lists orders for staff by status, with the buyer", async () => {
    const { admin, order } = await setup();
    expect((await listOrders(db, admin, "PENDING_PAYMENT"))[0]).toMatchObject({ reference: order.reference, buyerEmail: "b@example.com" });
    expect(await listOrders(db, admin, "PAID")).toHaveLength(0);
    await expect(listOrders(db, await makeActor(db, "c@example.com", ["content_manager"]))).rejects.toBeInstanceOf(ForbiddenError);
  });
});
