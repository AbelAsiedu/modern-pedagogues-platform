import { createHash, randomInt } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { format, money, splitSale } from "../../lib/money";
import { SITE } from "../../lib/site";
import { loadSiteText } from "../content/site-content";
import { recordAudit } from "../audit";
import { enforceRateLimit } from "../auth/rate-limit";
import { parseOrThrow } from "../auth/validation";
import type { Db, DbOrTx } from "../db";
import { creatorProfiles, orders, productFiles, products, siteSettings, users } from "../db/schema";
import { deliverEmail, type DeliverDeps } from "../email/deliver";
import { orderAlertMessage, orderPaidMessage, orderPlacedMessage } from "../email/templates";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { assertCan, can, type Actor } from "../permissions/authorize";
import { inspectPdf } from "../resources/pdf";
import { assertKnownTaxonomy } from "../resources/taxonomy";
import { listingInput, priceFrom, RESOURCE_KINDS, type ResourceKind } from "../resources/quality";

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Total PDF storage one creator may hold (live and waiting-for-review files together). */
export const CREATOR_STORAGE_BYTES = 100 * 1024 * 1024;
const MAX_OPEN_ORDERS_PER_USER = 5;

// ---------- helpers ----------

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

/** "25.50" for edit forms. */
export function toDecimal(pesewas: bigint): string {
  return `${pesewas / 100n}.${(pesewas % 100n).toString().padStart(2, "0")}`;
}

/** A PDF starts with "%PDF-". The browser's claimed type and the file name are not trusted. */
export function looksLikePdf(bytes: Buffer): boolean {
  return bytes.length > 8 && bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

const uniqueViolation = (err: unknown) => ((err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code) === "23505";

export async function uniqueSlug(db: DbOrTx, title: string): Promise<string> {
  const base = slugify(title);
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const [hit] = await db.select({ id: products.id }).from(products).where(eq(products.slug, candidate)).limit(1);
    if (!hit) return candidate;
  }
  return `${base}-${randomInt(1000, 9999)}`;
}

/** Fields a reviewer checks. Changing any of them on an approved listing sends it back for review. */
export const REVIEWED_FIELDS = ["title", "summary", "description", "kind", "subject", "levelKeys", "curriculumKeys", "language", "authorName", "outcomes", "audience", "tableOfContents", "coverPath"] as const;

// ---------- public catalogue ----------

export type PublicProduct = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  priceMinor: bigint;
  coverPath: string | null;
  kind: ResourceKind;
  subject: string;
  levelKeys: string[];
  curriculumKeys: string[];
  language: string;
  authorName: string;
  outcomes: string[];
  audience: string;
  tableOfContents: string;
  pageCount: number | null;
};

/** Explicit columns on purpose: file references, owner and review fields are not selectable from the public path. */
const publicColumns = {
  id: products.id,
  slug: products.slug,
  title: products.title,
  summary: products.summary,
  description: products.description,
  priceMinor: products.priceMinor,
  coverPath: products.coverPath,
  kind: products.kind,
  subject: products.subject,
  levelKeys: products.levelKeys,
  curriculumKeys: products.curriculumKeys,
  language: products.language,
  authorName: products.authorName,
  outcomes: products.outcomes,
  audience: products.audience,
  tableOfContents: products.tableOfContents,
  pageCount: products.pageCount,
};
/** Shown to the public only when approved, switched on, and carrying a reviewed file. */
const visible = and(eq(products.status, "APPROVED"), eq(products.isPublished, true), sql`${products.fileId} IS NOT NULL`);

export const isFree = (p: { priceMinor: bigint }) => p.priceMinor === 0n;
export const priceText = (p: { priceMinor: bigint }) => (p.priceMinor === 0n ? "Free" : format(money(p.priceMinor, "GHS")));

export type ResourceFilter = { q?: string; kind?: string; subject?: string; level?: string; price?: string };

const likeSafe = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listPublicProducts(db: DbOrTx, filter: ResourceFilter = {}): Promise<PublicProduct[]> {
  const conds: (SQL | undefined)[] = [visible];
  const q = filter.q?.trim().slice(0, 80);
  if (q) {
    const pat = `%${likeSafe(q)}%`;
    conds.push(or(ilike(products.title, pat), ilike(products.summary, pat), ilike(products.subject, pat), ilike(products.authorName, pat)));
  }
  const subject = filter.subject?.trim().slice(0, 80);
  if (subject) conds.push(sql`lower(btrim(${products.subject})) = ${subject.toLowerCase()}`);
  if (filter.kind && (RESOURCE_KINDS as readonly string[]).includes(filter.kind)) conds.push(eq(products.kind, filter.kind as ResourceKind));
  if (filter.level && /^[a-z0-9_-]{1,40}$/.test(filter.level)) conds.push(sql`${filter.level} = ANY(${products.levelKeys})`);
  if (filter.price === "free") conds.push(eq(products.priceMinor, 0n));
  if (filter.price === "paid") conds.push(sql`${products.priceMinor} > 0`);
  return db
    .select(publicColumns)
    .from(products)
    .where(and(...conds))
    .orderBy(asc(products.sortOrder), desc(products.approvedAt), desc(products.createdAt));
}

/** The subjects that have at least one visible resource, spelled as most listings spell them, A to Z (so the filter never leads to an empty page). */
export async function listPublicSubjects(db: DbOrTx): Promise<string[]> {
  const rows = await db.select({ subject: products.subject }).from(products).where(visible);
  const seen = new Map<string, Map<string, number>>();
  for (const { subject } of rows) {
    const clean = subject.trim().replace(/\s+/g, " ");
    if (!clean) continue;
    const spellings = seen.get(clean.toLowerCase()) ?? new Map<string, number>();
    spellings.set(clean, (spellings.get(clean) ?? 0) + 1);
    seen.set(clean.toLowerCase(), spellings);
  }
  return [...seen.values()]
    .map((sp) => [...sp.entries()].sort((a, b) => b[1] - a[1] || Number(/^\p{Lu}/u.test(b[0])) - Number(/^\p{Lu}/u.test(a[0])) || a[0].localeCompare(b[0]))[0]![0])
    .sort((a, b) => a.localeCompare(b));
}

export async function getPublicProduct(db: DbOrTx, slug: string): Promise<PublicProduct | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const [row] = await db.select(publicColumns).from(products).where(and(visible, eq(products.slug, slug))).limit(1);
  return row ?? null;
}

// ---------- staff: TMP's own products ----------

const staffListing = listingInput.extend({
  kind: z.enum(RESOURCE_KINDS).default("OTHER"),
  isPublished: z.boolean().default(false),
});

function staffData(input: unknown) {
  const data = parseOrThrow(staffListing, input);
  const price = priceFrom(data, false);
  if (!price.ok) throw new ValidationError({ price: [price.message] }, price.message);
  return { data, priceMinor: price.pesewas };
}

export async function listProducts(db: Db, actor: Actor | null) {
  assertCan(actor, "commerce.manage_products");
  return db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      summary: products.summary,
      description: products.description,
      priceMinor: products.priceMinor,
      coverPath: products.coverPath,
      kind: products.kind,
      subject: products.subject,
      levelKeys: products.levelKeys,
      curriculumKeys: products.curriculumKeys,
      language: products.language,
      authorName: products.authorName,
      outcomes: products.outcomes,
      audience: products.audience,
      tableOfContents: products.tableOfContents,
      status: products.status,
      ownerId: products.ownerId,
      ownerName: creatorProfiles.displayName,
      isPublished: products.isPublished,
      sortOrder: products.sortOrder,
      fileId: products.fileId,
      fileName: productFiles.filename,
      fileSize: productFiles.byteSize,
      downloadCount: products.downloadCount,
    })
    .from(products)
    .leftJoin(productFiles, eq(productFiles.id, products.fileId))
    .leftJoin(creatorProfiles, eq(creatorProfiles.userId, products.ownerId))
    .orderBy(asc(products.sortOrder), desc(products.createdAt));
}

export async function createProduct(db: Db, actor: Actor | null, input: unknown, ip?: string | null) {
  assertCan(actor, "commerce.manage_products");
  const { data, priceMinor } = staffData(input);
  if (data.isPublished) throw new ValidationError({ isPublished: ["Upload the PDF first, then publish."] }, "publish needs a file");
  await assertKnownTaxonomy(db, data.levelKeys, data.curriculumKeys);
  const slug = await uniqueSlug(db, data.title);
  const [row] = await db
    .insert(products)
    .values({
      slug,
      title: data.title,
      summary: data.summary,
      description: data.description,
      kind: data.kind,
      subject: data.subject,
      levelKeys: data.levelKeys,
      curriculumKeys: data.curriculumKeys,
      language: data.language,
      authorName: data.authorName || SITE.name,
      outcomes: data.outcomes,
      audience: data.audience,
      tableOfContents: data.tableOfContents,
      priceMinor,
      coverPath: data.coverPath,
      sortOrder: data.sortOrder,
      isPublished: false,
      status: "APPROVED", // TMP's own resources need no review
      approvedAt: new Date(),
      createdById: actor.id,
    })
    .returning({ id: products.id });
  await recordAudit(db, { actorId: actor.id, action: "product.created", entityType: "product", entityId: row!.id, ip });
  return row!.id;
}

export async function updateProduct(db: Db, actor: Actor | null, id: string, input: unknown, ip?: string | null) {
  assertCan(actor, "commerce.manage_products");
  const { data, priceMinor } = staffData(input);
  await assertKnownTaxonomy(db, data.levelKeys, data.curriculumKeys);
  const [current] = await db.select({ fileId: products.fileId, ownerId: products.ownerId }).from(products).where(eq(products.id, id)).limit(1);
  if (!current) throw new NotFoundError("product not found");
  if (current.ownerId) throw new ForbiddenError("creator resources are changed by their creator, not by staff");
  if (data.isPublished && !current.fileId) throw new ValidationError({ isPublished: ["Upload the PDF first, then publish."] }, "publish needs a file");
  await db
    .update(products)
    .set({
      title: data.title,
      summary: data.summary,
      description: data.description,
      kind: data.kind,
      subject: data.subject,
      levelKeys: data.levelKeys,
      curriculumKeys: data.curriculumKeys,
      language: data.language,
      authorName: data.authorName || SITE.name,
      outcomes: data.outcomes,
      audience: data.audience,
      tableOfContents: data.tableOfContents,
      priceMinor,
      coverPath: data.coverPath,
      sortOrder: data.sortOrder,
      isPublished: data.isPublished,
    })
    .where(eq(products.id, id));
  await recordAudit(db, { actorId: actor.id, action: "product.updated", entityType: "product", entityId: id, ip });
}

/** Show or hide one of TMP's own resources without opening the whole edit form. Showing needs the PDF to be there. */
export async function setProductPublished(db: Db, actor: Actor | null, id: string, published: boolean, ip?: string | null) {
  assertCan(actor, "commerce.manage_products");
  const [current] = await db.select({ fileId: products.fileId, ownerId: products.ownerId }).from(products).where(eq(products.id, id)).limit(1);
  if (!current) throw new NotFoundError("product not found");
  if (current.ownerId) throw new ForbiddenError("creator resources are shown or hidden by their creator, or suspended by staff");
  if (published && !current.fileId) throw new ValidationError({ isPublished: ["Upload the PDF first, then publish."] }, "Upload the PDF first, then publish.");
  await db.update(products).set({ isPublished: published }).where(eq(products.id, id));
  await recordAudit(db, { actorId: actor.id, action: published ? "product.published" : "product.hidden", entityType: "product", entityId: id, ip });
}

/** A product that has ever been ordered cannot be deleted (buyers keep their downloads); hide it instead. */
export async function deleteProduct(db: Db, actor: Actor | null, id: string, ip?: string | null) {
  assertCan(actor, "commerce.manage_products");
  const [current] = await db.select({ ownerId: products.ownerId }).from(products).where(eq(products.id, id)).limit(1);
  if (!current) throw new NotFoundError("product not found");
  if (current.ownerId) throw new ForbiddenError("creator resources are removed by their creator, or suspended by staff");
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(orders).where(eq(orders.productId, id));
  if (n > 0) throw new ConflictError("This product has orders, so it cannot be deleted. Untick Published to hide it instead.");
  const [row] = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id, fileId: products.fileId, pendingFileId: products.pendingFileId });
  if (!row) throw new NotFoundError("product not found");
  for (const f of [row.fileId, row.pendingFileId]) if (f) await db.delete(productFiles).where(eq(productFiles.id, f));
  await recordAudit(db, { actorId: actor.id, action: "product.deleted", entityType: "product", entityId: id, ip });
}

// ---------- PDF upload (staff and creators) ----------

/**
 * Attach a PDF. TMP's own products take it live immediately. A creator's file is kept as "pending" until a reviewer
 * approves it, so buyers never receive an unreviewed file; replacing the file on an approved listing hides the listing
 * until it is approved again (people who already bought keep the reviewed file they paid for).
 */
export async function attachProductFile(db: Db, actor: Actor | null, productId: string, input: { filename: string; bytes: Buffer }, ip?: string | null) {
  if (!actor || actor.status !== "ACTIVE") throw new ForbiddenError("sign in to upload");
  const fail = (m: string) => new ValidationError({ file: [m] }, m);
  if (input.bytes.length === 0) throw fail("Choose a PDF to upload.");
  if (input.bytes.length > MAX_FILE_BYTES) throw fail("That file is too large (15 MB maximum).");
  if (!looksLikePdf(input.bytes)) throw fail("Upload a PDF file.");

  const [p] = await db
    .select({ ownerId: products.ownerId, status: products.status })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!p) throw new NotFoundError("product not found");
  const staffOwn = p.ownerId === null && can(actor, "commerce.manage_products");
  const creatorOwn = p.ownerId === actor.id && can(actor, "portal.creator");
  if (!staffOwn && !creatorOwn) throw new ForbiddenError("not allowed to upload for this resource");
  if (creatorOwn) {
    const [profile] = await db.select({ s: creatorProfiles.isSuspended }).from(creatorProfiles).where(eq(creatorProfiles.userId, actor.id)).limit(1);
    if (!profile || profile.s) throw new ForbiddenError("creator account is not active");
    if (!(["DRAFT", "CHANGES_REQUESTED", "APPROVED"] as const).includes(p.status as never)) {
      throw new ConflictError(p.status === "IN_REVIEW" ? "This resource is being reviewed. You can change the file once the review is finished." : "This resource can no longer be changed.");
    }
    await enforceRateLimit(db, { key: `upload:pdf:${actor.id}`, limit: 10, windowSeconds: 3600 });
  }

  const report = await inspectPdf(input.bytes);
  if (report.problems.length > 0) throw new ValidationError({ file: report.problems }, report.problems[0]);

  const base = (input.filename.split(/[\\/]/).pop() ?? "").replace(/[^\w .()-]/g, "").replace(/^\.+/, "").trim().slice(0, 120).replace(/\.pdf$/i, "");
  const filename = `${base || "resource"}.pdf`;

  await db.transaction(async (tx) => {
    const [cur] = await tx
      .select({ fileId: products.fileId, pendingFileId: products.pendingFileId, status: products.status })
      .from(products)
      .where(eq(products.id, productId))
      .for("update")
      .limit(1);
    if (!cur) throw new NotFoundError("product not found");
    const replaced = creatorOwn ? cur.pendingFileId : cur.fileId;

    if (creatorOwn) {
      // Storage quota: everything this creator holds, not counting the file being replaced.
      const [{ total } = { total: 0 }] = await tx
        .select({ total: sql<number>`coalesce(sum(${productFiles.byteSize}), 0)::bigint` })
        .from(productFiles)
        .where(sql`${productFiles.id} IN (SELECT file_id FROM products WHERE owner_id = ${actor.id} AND file_id IS NOT NULL UNION SELECT pending_file_id FROM products WHERE owner_id = ${actor.id} AND pending_file_id IS NOT NULL)${replaced ? sql` AND ${productFiles.id} <> ${replaced}` : sql``}`);
      if (Number(total) + input.bytes.length > CREATOR_STORAGE_BYTES) {
        throw new ConflictError("You have reached your storage limit (100 MB of PDFs). Delete a resource you no longer sell, or contact TMP.");
      }
    }

    const [file] = await tx
      .insert(productFiles)
      .values({
        filename,
        contentType: "application/pdf",
        byteSize: input.bytes.length,
        sha256: createHash("sha256").update(input.bytes).digest("hex"),
        pages: report.pages,
        inspectionNotes: report.notes,
        data: input.bytes,
        uploadedById: actor.id,
      })
      .returning({ id: productFiles.id });

    if (creatorOwn) {
      await tx.update(products).set({ pendingFileId: file!.id, ...(cur.status === "APPROVED" ? { status: "DRAFT" as const, isPublished: false } : {}) }).where(eq(products.id, productId));
    } else {
      await tx.update(products).set({ fileId: file!.id, pageCount: report.pages }).where(eq(products.id, productId));
    }
    if (replaced) await tx.delete(productFiles).where(eq(productFiles.id, replaced));
    await recordAudit(tx, { actorId: actor.id, action: "product.file_uploaded", entityType: "product", entityId: productId, metadata: { bytes: input.bytes.length, pages: report.pages }, ip });
  });
}

// ---------- downloads ----------

/** A free resource: any signed-in account may download it while it is approved and switched on. */
export async function getFreeDownload(db: Db, actor: Actor | null, slug: string) {
  if (!actor || actor.status !== "ACTIVE" || !/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const [row] = await db
    .select({ id: products.id, data: productFiles.data, filename: productFiles.filename, contentType: productFiles.contentType })
    .from(products)
    .innerJoin(productFiles, eq(productFiles.id, products.fileId))
    .where(and(visible, eq(products.slug, slug), eq(products.priceMinor, 0n)))
    .limit(1);
  if (!row) return null;
  await db.update(products).set({ downloadCount: sql`${products.downloadCount} + 1` }).where(eq(products.id, row.id));
  return row;
}

/** The signed-in user's live order (waiting for payment, or paid) for a product, so the page can show the right button. */
export async function getMyOrderForProduct(db: DbOrTx, actor: Actor | null, productId: string) {
  if (!actor || actor.status !== "ACTIVE") return null;
  const [row] = await db
    .select({ id: orders.id, status: orders.status, reference: orders.reference })
    .from(orders)
    .where(and(eq(orders.userId, actor.id), eq(orders.productId, productId), inArray(orders.status, ["PENDING_PAYMENT", "PAID"])))
    .limit(1);
  return row ?? null;
}

/** The PDF for a paid order: the buyer (once PAID, and unless staff have suspended the resource) or staff who manage orders. */
export async function getDownload(db: Db, actor: Actor | null, orderId: string) {
  if (!actor || actor.status !== "ACTIVE" || !/^[0-9a-f-]{36}$/.test(orderId)) return null;
  const [row] = await db
    .select({ userId: orders.userId, status: orders.status, productStatus: products.status, data: productFiles.data, filename: productFiles.filename, contentType: productFiles.contentType, sha256: productFiles.sha256 })
    .from(orders)
    .innerJoin(products, eq(products.id, orders.productId))
    .innerJoin(productFiles, eq(productFiles.id, products.fileId))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!row) return null;
  const staff = can(actor, "commerce.manage_orders");
  const mine = row.userId === actor.id && row.status === "PAID" && row.productStatus !== "SUSPENDED";
  return mine || staff ? row : null;
}

// ---------- buyers ----------

export type ShopDeps = DeliverDeps & { appUrl: string; notifyEmail?: string };

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
function newReference(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return `TMP-${s}`;
}

function requireBuyer(actor: Actor | null): asserts actor is Actor {
  if (!actor || actor.status !== "ACTIVE") throw new ForbiddenError("sign in to order");
}

/**
 * Order a paid resource. Idempotent: asking again for one you already have an unpaid or paid order for returns that
 * order. The price is copied from the listing at this moment. Free resources are downloaded directly, not ordered.
 */
export async function placeOrder(deps: ShopDeps, actor: Actor | null, slug: string) {
  requireBuyer(actor);
  const { db } = deps;
  const [product] = await db
    .select({ id: products.id, title: products.title, priceMinor: products.priceMinor, ownerId: products.ownerId })
    .from(products)
    .where(and(visible, eq(products.slug, /^[a-z0-9-]{1,80}$/.test(slug) ? slug : "")))
    .limit(1);
  if (!product) throw new NotFoundError("product not found");
  if (product.priceMinor === 0n) throw new ConflictError("This resource is free. Use the Download button instead.");
  if (product.ownerId === actor.id) throw new ConflictError("This is your own resource. You can download it from your creator dashboard.");

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
  const { biz } = await loadSiteText(db);
  if (buyer) {
    await deliverEmail(deps, orderPlacedMessage(buyer.email, buyer.fullName, { reference: order.reference, productTitle: order.productTitle, amount, momoNetwork: biz.momoNetwork, momoNumber: biz.momoNumber, ordersLink: `${base}/account/orders` }));
    await deliverEmail(deps, orderAlertMessage(deps.notifyEmail ?? biz.email, { buyer: buyer.fullName, productTitle: order.productTitle, amount, reference: order.reference, link: `${base}/admin/orders` }));
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
      paymentMethod: orders.paymentMethod,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      creatorShareMinor: orders.creatorShareMinor,
      platformShareMinor: orders.platformShareMinor,
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

/** TMP's commission on creator sales, in basis points (the `marketplace.commission` setting; 30% by default). */
export async function getCommissionBps(db: DbOrTx): Promise<number> {
  const [row] = await db.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, "marketplace.commission")).limit(1);
  const bps = (row?.value as { commissionBps?: unknown } | undefined)?.commissionBps;
  return typeof bps === "number" && Number.isInteger(bps) && bps >= 0 && bps <= 10_000 ? bps : 3000;
}

/**
 * Confirm that the money arrived. Needs a transaction id as evidence; a second click or second admin changes nothing.
 * For a creator's resource the split between the creator and TMP is fixed here, in the same transaction.
 */
type SettledOrder = { id: string; userId: string; productId: string; amountMinor: bigint; productTitle: string; reference: string };

/**
 * Turn a waiting order into a paid one, once. Shared by the manual (staff) and Paystack paths so both fix the creator
 * split the same way. Returns null when the order was not in a state that can be paid (already paid: a repeat does nothing).
 * `allowCancelled` lets a verified Paystack payment revive an order the buyer cancelled while the payment was in flight.
 */
export async function settleOrderPaid(
  tx: DbOrTx,
  orderId: string,
  o: { paidById: string | null; note: string; method: "manual" | "paystack"; allowCancelled?: boolean },
): Promise<SettledOrder | null> {
  const [paid] = await tx
    .update(orders)
    .set({ status: "PAID", paidAt: new Date(), paidById: o.paidById, paymentNote: o.note, paymentMethod: o.method, cancelledAt: null })
    .where(and(eq(orders.id, orderId), inArray(orders.status, o.allowCancelled ? ["PENDING_PAYMENT", "CANCELLED"] : ["PENDING_PAYMENT"])))
    .returning({ id: orders.id, userId: orders.userId, productId: orders.productId, amountMinor: orders.amountMinor, productTitle: orders.productTitle, reference: orders.reference });
  if (!paid) return null;
  const [prod] = await tx.select({ ownerId: products.ownerId }).from(products).where(eq(products.id, paid.productId)).limit(1);
  if (prod?.ownerId) {
    const commissionBps = await getCommissionBps(tx);
    const split = splitSale({ gross: money(paid.amountMinor, "GHS"), commissionBps, processingFeeBps: 0, feeBearer: "platform" });
    await tx
      .update(orders)
      .set({ creatorId: prod.ownerId, commissionBps, creatorShareMinor: split.creatorShare.amount, platformShareMinor: split.platformNet.amount })
      .where(eq(orders.id, paid.id));
  }
  return paid;
}

/** Tell the buyer their payment arrived and the download is open. */
export async function sendOrderPaidEmail(deps: ShopDeps, order: SettledOrder) {
  const [buyer] = await deps.db.select({ email: users.email, fullName: users.fullName }).from(users).where(eq(users.id, order.userId)).limit(1);
  if (buyer) await deliverEmail(deps, orderPaidMessage(buyer.email, buyer.fullName, { productTitle: order.productTitle, reference: order.reference, ordersLink: `${deps.appUrl.replace(/\/$/, "")}/account/orders` }));
}

/**
 * Confirm that the money arrived. Needs a transaction id as evidence; a second click or second admin changes nothing.
 * For a creator's resource the split between the creator and TMP is fixed here, in the same transaction.
 */
export async function markOrderPaid(deps: ShopDeps, actor: Actor | null, orderId: string, note: unknown, ip?: string | null) {
  assertCan(actor, "commerce.manage_orders");
  const proof = parseOrThrow(z.object({ note: paymentNote }), { note }).note;
  const { db } = deps;
  const row = await db.transaction(async (tx) => {
    const paid = await settleOrderPaid(tx, orderId, { paidById: actor.id, note: proof, method: "manual" });
    if (!paid) throw new ConflictError("That order is no longer waiting for payment.");
    await recordAudit(tx, { actorId: actor.id, action: "order.paid", entityType: "order", entityId: orderId, metadata: { reference: paid.reference }, ip });
    return paid;
  });
  await sendOrderPaidEmail(deps, row);
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
