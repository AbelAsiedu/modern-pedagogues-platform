import { createHash, randomInt } from "node:crypto";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { format, money, parseDecimal, MoneyError } from "../../lib/money";
import { SITE } from "../../lib/site";
import { recordAudit } from "../audit";
import { parseOrThrow } from "../auth/validation";
import type { Db, DbOrTx } from "../db";
import { orders, productFiles, products, users } from "../db/schema";
import { deliverEmail, type DeliverDeps } from "../email/deliver";
import { orderAlertMessage, orderPaidMessage, orderPlacedMessage } from "../email/templates";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { assertCan, can, type Actor } from "../permissions/authorize";

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MIN_PRICE = 100n; // GH₵ 1.00
export const MAX_PRICE = 500_000n; // GH₵ 5,000.00
const MAX_OPEN_ORDERS_PER_USER = 5;

// ---------- input ----------

const price = z
  .string()
  .trim()
  .transform((v, ctx) => {
    try {
      const m = parseDecimal(v, "GHS");
      if (m.amount < MIN_PRICE || m.amount > MAX_PRICE) {
        ctx.addIssue({ code: "custom", message: "Price must be between GH₵ 1 and GH₵ 5,000." });
        return z.NEVER;
      }
      return m.amount;
    } catch (e) {
      if (e instanceof MoneyError) {
        ctx.addIssue({ code: "custom", message: "Enter the price in cedis, for example 25 or 25.50." });
        return z.NEVER;
      }
      throw e;
    }
  });

const coverPath = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null)
  .pipe(z.string().regex(/^\/media\/[0-9a-f-]{36}\.(jpg|png|webp)$/, "Choose a picture from the list.").nullable());

export const productInput = z.object({
  title: z.string().trim().min(3, "Enter a title.").max(120),
  summary: z.string().trim().min(10, "Write a short summary (one or two sentences).").max(240),
  description: z.string().trim().max(4000).default(""),
  price,
  coverPath,
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  isPublished: z.boolean().default(false),
});
export type ProductInput = z.input<typeof productInput>;

export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base || "resource";
}

/** "25.50" for the edit form. */
export function toDecimal(pesewas: bigint): string {
  const whole = pesewas / 100n;
  const frac = (pesewas % 100n).toString().padStart(2, "0");
  return `${whole}.${frac}`;
}

// ---------- public catalogue ----------

export type PublicProduct = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  priceMinor: bigint;
  coverPath: string | null;
};

/** Explicit columns on purpose: the file reference and internal fields are not selectable from the public path. */
const publicColumns = {
  id: products.id,
  slug: products.slug,
  title: products.title,
  summary: products.summary,
  description: products.description,
  priceMinor: products.priceMinor,
  coverPath: products.coverPath,
};
const visible = and(eq(products.isPublished, true));

export async function listPublicProducts(db: DbOrTx): Promise<PublicProduct[]> {
  return db.select(publicColumns).from(products).where(visible).orderBy(asc(products.sortOrder), desc(products.createdAt));
}

export async function getPublicProduct(db: DbOrTx, slug: string): Promise<PublicProduct | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const [row] = await db.select(publicColumns).from(products).where(and(visible, eq(products.slug, slug))).limit(1);
  return row ?? null;
}

export const priceText = (p: { priceMinor: bigint }) => format(money(p.priceMinor, "GHS"));

// ---------- staff: products ----------

export async function listProducts(db: Db, actor: Actor | null) {
  assertCan(actor, "commerce.manage_products");
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      summary: products.summary,
      description: products.description,
      priceMinor: products.priceMinor,
      coverPath: products.coverPath,
      isPublished: products.isPublished,
      sortOrder: products.sortOrder,
      fileId: products.fileId,
      fileName: productFiles.filename,
      fileSize: productFiles.byteSize,
    })
    .from(products)
    .leftJoin(productFiles, eq(productFiles.id, products.fileId))
    .orderBy(asc(products.sortOrder), desc(products.createdAt));
  return rows;
}

async function uniqueSlug(db: Db, title: string): Promise<string> {
  const base = slugify(title);
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const [hit] = await db.select({ id: products.id }).from(products).where(eq(products.slug, candidate)).limit(1);
    if (!hit) return candidate;
  }
  return `${base}-${randomInt(1000, 9999)}`;
}

export async function createProduct(db: Db, actor: Actor | null, input: unknown, ip?: string | null) {
  assertCan(actor, "commerce.manage_products");
  const data = parseOrThrow(productInput, input);
  if (data.isPublished) throw new ValidationError({ isPublished: ["Upload the PDF first, then publish."] }, "publish needs a file");
  const slug = await uniqueSlug(db, data.title);
  const [row] = await db
    .insert(products)
    .values({ slug, title: data.title, summary: data.summary, description: data.description, priceMinor: data.price, coverPath: data.coverPath, sortOrder: data.sortOrder, isPublished: false, createdById: actor.id })
    .returning({ id: products.id });
  await recordAudit(db, { actorId: actor.id, action: "product.created", entityType: "product", entityId: row!.id, ip });
  return row!.id;
}

export async function updateProduct(db: Db, actor: Actor | null, id: string, input: unknown, ip?: string | null) {
  assertCan(actor, "commerce.manage_products");
  const data = parseOrThrow(productInput, input);
  const [current] = await db.select({ fileId: products.fileId }).from(products).where(eq(products.id, id)).limit(1);
  if (!current) throw new NotFoundError("product not found");
  if (data.isPublished && !current.fileId) throw new ValidationError({ isPublished: ["Upload the PDF first, then publish."] }, "publish needs a file");
  await db
    .update(products)
    .set({ title: data.title, summary: data.summary, description: data.description, priceMinor: data.price, coverPath: data.coverPath, sortOrder: data.sortOrder, isPublished: data.isPublished })
    .where(eq(products.id, id));
  await recordAudit(db, { actorId: actor.id, action: "product.updated", entityType: "product", entityId: id, ip });
}

/** A product that has ever been ordered cannot be deleted (buyers keep their downloads); hide it instead. */
export async function deleteProduct(db: Db, actor: Actor | null, id: string, ip?: string | null) {
  assertCan(actor, "commerce.manage_products");
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(orders).where(eq(orders.productId, id));
  if (n > 0) throw new ConflictError("This product has orders, so it cannot be deleted. Untick Published to hide it instead.");
  const [row] = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id, fileId: products.fileId });
  if (!row) throw new NotFoundError("product not found");
  if (row.fileId) await db.delete(productFiles).where(eq(productFiles.id, row.fileId));
  await recordAudit(db, { actorId: actor.id, action: "product.deleted", entityType: "product", entityId: id, ip });
}

/** A PDF starts with "%PDF-". The browser's claimed type and the file name are not trusted. */
export function looksLikePdf(bytes: Buffer): boolean {
  return bytes.length > 8 && bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

export async function attachProductFile(db: Db, actor: Actor | null, productId: string, input: { filename: string; bytes: Buffer }, ip?: string | null) {
  assertCan(actor, "commerce.manage_products");
  const fail = (m: string) => new ValidationError({ file: [m] }, m);
  if (input.bytes.length === 0) throw fail("Choose a PDF to upload.");
  if (input.bytes.length > MAX_FILE_BYTES) throw fail("That file is too large (15 MB maximum).");
  if (!looksLikePdf(input.bytes)) throw fail("Upload a PDF file.");
  // Keep only the last path segment, then only harmless characters.
  const base = (input.filename.split(/[\\/]/).pop() ?? "").replace(/[^\w .()-]/g, "").replace(/^\.+/, "").trim().slice(0, 120).replace(/\.pdf$/i, "");
  const filename = `${base || "resource"}.pdf`;
  await db.transaction(async (tx) => {
    const [p] = await tx.select({ fileId: products.fileId }).from(products).where(eq(products.id, productId)).for("update").limit(1);
    if (!p) throw new NotFoundError("product not found");
    const [file] = await tx
      .insert(productFiles)
      .values({ filename, contentType: "application/pdf", byteSize: input.bytes.length, sha256: createHash("sha256").update(input.bytes).digest("hex"), data: input.bytes, uploadedById: actor.id })
      .returning({ id: productFiles.id });
    await tx.update(products).set({ fileId: file!.id }).where(eq(products.id, productId));
    if (p.fileId) await tx.delete(productFiles).where(eq(productFiles.id, p.fileId));
    await recordAudit(tx, { actorId: actor.id, action: "product.file_uploaded", entityType: "product", entityId: productId, metadata: { bytes: input.bytes.length }, ip });
  });
}

// ---------- buyers ----------

export type ShopDeps = DeliverDeps & { appUrl: string; notifyEmail?: string };

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
function newReference(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return `TMP-${s}`;
}

const uniqueViolation = (err: unknown) => ((err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code) === "23505";

function requireBuyer(actor: Actor | null): asserts actor is Actor {
  if (!actor || actor.status !== "ACTIVE") throw new ForbiddenError("sign in to order");
}

/**
 * Order a product. Idempotent: asking again for a product you already have an unpaid or paid order for returns that
 * order instead of creating another. The price is copied from the product at this moment.
 */
export async function placeOrder(deps: ShopDeps, actor: Actor | null, slug: string) {
  requireBuyer(actor);
  const { db } = deps;
  const product = await getPublicProduct(db, slug);
  if (!product) throw new NotFoundError("product not found");

  const live = async () =>
    (await db.select().from(orders).where(and(eq(orders.userId, actor.id), eq(orders.productId, product.id), inArray(orders.status, ["PENDING_PAYMENT", "PAID"]))).limit(1))[0];
  const existing = await live();
  if (existing) return { order: existing, created: false };

  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(orders).where(and(eq(orders.userId, actor.id), eq(orders.status, "PENDING_PAYMENT")));
  if (n >= MAX_OPEN_ORDERS_PER_USER) {
    throw new ConflictError("You have several orders waiting for payment. Pay for those, or cancel the ones you no longer want, before ordering more.");
  }

  let order: typeof orders.$inferSelect | undefined;
  for (let attempt = 0; attempt < 5 && !order; attempt++) {
    try {
      [order] = await db
        .insert(orders)
        .values({ reference: newReference(), userId: actor.id, productId: product.id, productTitle: product.title, amountMinor: product.priceMinor, currency: "GHS" })
        .returning();
    } catch (err) {
      if (!uniqueViolation(err)) throw err;
      const raced = await live(); // two clicks at once: the other one won
      if (raced) return { order: raced, created: false };
    }
  }
  if (!order) throw new ConflictError("We could not create your order. Please try again.");

  await recordAudit(db, { actorId: actor.id, action: "order.placed", entityType: "order", entityId: order.id, metadata: { reference: order.reference } });

  const [buyer] = await db.select({ email: users.email, fullName: users.fullName }).from(users).where(eq(users.id, actor.id)).limit(1);
  const amount = format(money(order.amountMinor, "GHS"));
  const base = deps.appUrl.replace(/\/$/, "");
  if (buyer) {
    await deliverEmail(deps, orderPlacedMessage(buyer.email, buyer.fullName, { reference: order.reference, productTitle: order.productTitle, amount, momoNetwork: SITE.momoNetwork, momoNumber: SITE.phoneDisplay, ordersLink: `${base}/account/orders` }));
    await deliverEmail(deps, orderAlertMessage(deps.notifyEmail ?? SITE.email, { buyer: buyer.fullName, productTitle: order.productTitle, amount, reference: order.reference, link: `${base}/admin/orders` }));
  }
  return { order, created: true };
}

export async function listMyOrders(db: Db, actor: Actor | null) {
  requireBuyer(actor);
  return db
    .select({ id: orders.id, reference: orders.reference, productTitle: orders.productTitle, amountMinor: orders.amountMinor, status: orders.status, createdAt: orders.createdAt, paidAt: orders.paidAt })
    .from(orders)
    .where(eq(orders.userId, actor.id))
    .orderBy(desc(orders.createdAt));
}

/** Buyers can drop their own unpaid orders. A paid order is a record and cannot be cancelled here. */
export async function cancelMyOrder(db: Db, actor: Actor | null, orderId: string) {
  requireBuyer(actor);
  const res = await db
    .update(orders)
    .set({ status: "CANCELLED", cancelledAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.userId, actor.id), eq(orders.status, "PENDING_PAYMENT")))
    .returning({ id: orders.id });
  if (res.length === 0) throw new NotFoundError("order not found or no longer cancellable");
  await recordAudit(db, { actorId: actor.id, action: "order.cancelled", entityType: "order", entityId: orderId, metadata: { by: "buyer" } });
}

/** The PDF for a paid order. Only the buyer or staff who manage orders; anything else looks like "not found". */
export async function getDownload(db: Db, actor: Actor | null, orderId: string) {
  if (!actor || actor.status !== "ACTIVE" || !/^[0-9a-f-]{36}$/.test(orderId)) return null;
  const [row] = await db
    .select({ userId: orders.userId, status: orders.status, data: productFiles.data, filename: productFiles.filename, contentType: productFiles.contentType, sha256: productFiles.sha256 })
    .from(orders)
    .innerJoin(products, eq(products.id, orders.productId))
    .innerJoin(productFiles, eq(productFiles.id, products.fileId))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!row) return null;
  const staff = can(actor, "commerce.manage_orders");
  const mine = row.userId === actor.id && row.status === "PAID";
  return mine || staff ? row : null;
}

// ---------- staff: orders ----------

export async function listOrders(db: Db, actor: Actor | null, status?: "PENDING_PAYMENT" | "PAID" | "CANCELLED") {
  assertCan(actor, "commerce.manage_orders");
  return db
    .select({
      id: orders.id,
      reference: orders.reference,
      productTitle: orders.productTitle,
      amountMinor: orders.amountMinor,
      status: orders.status,
      paymentNote: orders.paymentNote,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      buyerName: users.fullName,
      buyerEmail: users.email,
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(status ? eq(orders.status, status) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(200);
}

export async function orderCounts(db: Db, actor: Actor | null) {
  assertCan(actor, "commerce.manage_orders");
  const rows = await db.select({ status: orders.status, n: sql<number>`count(*)::int` }).from(orders).groupBy(orders.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<"PENDING_PAYMENT" | "PAID" | "CANCELLED", number>>;
}

const paymentNote = z.string().trim().min(4, "Enter the MoMo transaction ID (or other proof of payment).").max(80);

/** Confirm that the money arrived. Needs a transaction id as evidence; a second click or second admin changes nothing. */
export async function markOrderPaid(deps: ShopDeps, actor: Actor | null, orderId: string, note: unknown, ip?: string | null) {
  assertCan(actor, "commerce.manage_orders");
  const proof = parseOrThrow(z.object({ note: paymentNote }), { note }).note;
  const { db } = deps;
  const [row] = await db
    .update(orders)
    .set({ status: "PAID", paidAt: new Date(), paidById: actor.id, paymentNote: proof })
    .where(and(eq(orders.id, orderId), eq(orders.status, "PENDING_PAYMENT")))
    .returning({ id: orders.id, userId: orders.userId, productTitle: orders.productTitle, reference: orders.reference });
  if (!row) throw new ConflictError("That order is no longer waiting for payment.");
  await recordAudit(db, { actorId: actor.id, action: "order.paid", entityType: "order", entityId: orderId, metadata: { reference: row.reference }, ip });
  const [buyer] = await db.select({ email: users.email, fullName: users.fullName }).from(users).where(eq(users.id, row.userId)).limit(1);
  if (buyer) await deliverEmail(deps, orderPaidMessage(buyer.email, buyer.fullName, { productTitle: row.productTitle, reference: row.reference, ordersLink: `${deps.appUrl.replace(/\/$/, "")}/account/orders` }));
}

export async function cancelOrderByStaff(db: Db, actor: Actor | null, orderId: string, ip?: string | null) {
  assertCan(actor, "commerce.manage_orders");
  const res = await db
    .update(orders)
    .set({ status: "CANCELLED", cancelledAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.status, "PENDING_PAYMENT")))
    .returning({ id: orders.id });
  if (res.length === 0) throw new ConflictError("Only orders waiting for payment can be cancelled.");
  await recordAudit(db, { actorId: actor.id, action: "order.cancelled", entityType: "order", entityId: orderId, metadata: { by: "staff" }, ip });
}
