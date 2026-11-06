import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "../audit";
import { parseOrThrow } from "../auth/validation";
import type { Db } from "../db";
import { creatorProfiles, productFiles, products, resourceReviews, users } from "../db/schema";
import { deliverEmail } from "../email/deliver";
import { resourceDecisionMessage, type ResourceDecisionKind } from "../email/templates";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { assertCan, type Actor } from "../permissions/authorize";
import type { ShopDeps } from "../shop/service";
import { listingReadiness } from "./creators";
import { evaluateRubric, RUBRIC_VERSION } from "./quality";

export async function listReviewQueue(db: Db, actor: Actor | null) {
  assertCan(actor, "marketplace.moderate");
  return db
    .select({
      id: products.id,
      title: products.title,
      kind: products.kind,
      priceMinor: products.priceMinor,
      submittedAt: products.submittedAt,
      submissionCount: products.submissionCount,
      creatorName: creatorProfiles.displayName,
    })
    .from(products)
    .leftJoin(creatorProfiles, eq(creatorProfiles.userId, products.ownerId))
    .where(eq(products.status, "IN_REVIEW"))
    .orderBy(asc(products.submittedAt));
}

/** Resources by status, for the staff overview (everything creators have submitted, and TMP's own are excluded). */
export async function creatorResourceCounts(db: Db, actor: Actor | null) {
  assertCan(actor, "marketplace.moderate");
  const rows = await db
    .select({ status: products.status, n: sql<number>`count(*)::int` })
    .from(products)
    .where(sql`${products.ownerId} IS NOT NULL`)
    .groupBy(products.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<(typeof products.$inferSelect)["status"], number>>;
}

export async function listCreatorResources(db: Db, actor: Actor | null, status?: (typeof products.$inferSelect)["status"]) {
  assertCan(actor, "marketplace.moderate");
  return db
    .select({ id: products.id, title: products.title, kind: products.kind, status: products.status, priceMinor: products.priceMinor, isPublished: products.isPublished, creatorName: creatorProfiles.displayName, updatedAt: products.updatedAt })
    .from(products)
    .leftJoin(creatorProfiles, eq(creatorProfiles.userId, products.ownerId))
    .where(and(sql`${products.ownerId} IS NOT NULL`, status ? eq(products.status, status) : undefined))
    .orderBy(desc(products.updatedAt))
    .limit(200);
}

export async function getReviewItem(db: Db, actor: Actor | null, id: string) {
  assertCan(actor, "marketplace.moderate");
  const [p] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!p || !p.ownerId) throw new NotFoundError("resource not found");
  const [owner] = await db
    .select({ name: creatorProfiles.displayName, bio: creatorProfiles.bio, email: users.email, suspended: creatorProfiles.isSuspended })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.userId, p.ownerId))
    .limit(1);
  const fileId = p.pendingFileId ?? p.fileId;
  const [file] = fileId ? await db.select({ filename: productFiles.filename, byteSize: productFiles.byteSize, pages: productFiles.pages, notes: productFiles.inspectionNotes }).from(productFiles).where(eq(productFiles.id, fileId)).limit(1) : [];
  const reviews = await db.select().from(resourceReviews).where(eq(resourceReviews.productId, id)).orderBy(desc(resourceReviews.createdAt));
  const unmet = await listingReadiness(db, p, p.declaredAt !== null);
  return { product: p, owner: owner ?? null, file: file ?? null, reviews, unmet };
}

/** The file under review (the creator's newest upload), for staff to open before deciding. */
export async function getReviewFile(db: Db, actor: Actor | null, productId: string) {
  assertCan(actor, "marketplace.moderate");
  if (!/^[0-9a-f-]{36}$/.test(productId)) return null;
  const [p] = await db.select({ fileId: products.fileId, pendingFileId: products.pendingFileId }).from(products).where(eq(products.id, productId)).limit(1);
  const fid = p?.pendingFileId ?? p?.fileId;
  if (!fid) return null;
  const [f] = await db.select({ data: productFiles.data, filename: productFiles.filename }).from(productFiles).where(eq(productFiles.id, fid)).limit(1);
  return f ?? null;
}

const decisionInput = z.object({
  decision: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]),
  submission: z.coerce.number().int().min(1),
  note: z.string().trim().max(4000).default(""),
  scores: z.record(z.string(), z.number()).default({}),
});
export type DecisionInput = z.input<typeof decisionInput>;

/**
 * Record a review decision. Approval needs every applicable rubric criterion scored and passing; asking for changes or
 * rejecting needs written feedback. The decision applies only to the submission the reviewer actually looked at, so two
 * reviewers (or a resubmission) cannot overwrite each other. Staff cannot review their own resources.
 */
export async function decideResource(deps: ShopDeps, actor: Actor | null, id: string, input: unknown, ip?: string | null) {
  assertCan(actor, "marketplace.moderate");
  const { db } = deps;
  const data = parseOrThrow(decisionInput, input);
  const [p] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!p || !p.ownerId) throw new NotFoundError("resource not found");
  if (p.ownerId === actor.id) throw new ForbiddenError("cannot review your own resource");
  const isPaid = p.priceMinor > 0n;

  if (data.decision === "APPROVED") {
    const rubric = evaluateRubric(data.scores, isPaid);
    if (rubric.missing.length > 0) throw new ConflictError(`Score every criterion from 0 to 4 before approving (not scored: ${rubric.missing.join(", ")}).`);
    if (!rubric.approvable) {
      const why = rubric.failing.length ? `these are below the pass mark: ${rubric.failing.join(", ")}` : `the average (${rubric.mean.toFixed(2)}) is below the required level`;
      throw new ConflictError(`It cannot be approved: ${why}. Request changes instead.`);
    }
    const unmet = await listingReadiness(db, p, p.declaredAt !== null);
    if (unmet.length > 0) throw new ConflictError(`It cannot be approved because the listing is incomplete: ${unmet.join(" ")}`);
  } else if (data.note.length < 20) {
    throw new ValidationError({ note: ["Write specific feedback of at least 20 characters so the creator knows what to do."] }, "feedback needed");
  }

  const title = p.title;
  const creatorId = p.ownerId;
  await db.transaction(async (tx) => {
    const [cur] = await tx
      .select({ status: products.status, submissionCount: products.submissionCount, fileId: products.fileId, pendingFileId: products.pendingFileId })
      .from(products)
      .where(eq(products.id, id))
      .for("update")
      .limit(1);
    if (!cur || cur.status !== "IN_REVIEW" || cur.submissionCount !== data.submission) {
      throw new ConflictError("This resource has changed or was already decided. Reload the page.");
    }
    if (data.decision === "APPROVED") {
      const newFile = cur.pendingFileId ?? cur.fileId;
      if (!newFile) throw new ConflictError("There is no file to approve.");
      const [f] = await tx.select({ pages: productFiles.pages }).from(productFiles).where(eq(productFiles.id, newFile)).limit(1);
      await tx
        .update(products)
        .set({ status: "APPROVED", isPublished: true, approvedAt: new Date(), fileId: newFile, pendingFileId: null, pageCount: f?.pages ?? null })
        .where(eq(products.id, id));
      if (cur.pendingFileId && cur.fileId && cur.fileId !== cur.pendingFileId) await tx.delete(productFiles).where(eq(productFiles.id, cur.fileId));
    } else {
      await tx.update(products).set({ status: data.decision, isPublished: false }).where(eq(products.id, id));
    }
    await tx.insert(resourceReviews).values({ productId: id, submission: data.submission, reviewerId: actor.id, decision: data.decision, rubricVersion: RUBRIC_VERSION, scores: Object.keys(data.scores).length ? data.scores : null, note: data.note });
    await recordAudit(tx, { actorId: actor.id, action: `resource.${data.decision.toLowerCase()}`, entityType: "product", entityId: id, ip });
  });
  await notifyCreator(deps, creatorId, title, data.decision, data.note);
}

async function notifyCreator(deps: ShopDeps, creatorId: string, title: string, decision: ResourceDecisionKind, note: string) {
  const [c] = await deps.db
    .select({ email: users.email, name: creatorProfiles.displayName })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.userId, creatorId))
    .limit(1);
  if (c) await deliverEmail(deps, resourceDecisionMessage(c.email, c.name, title, decision, note, `${deps.appUrl.replace(/\/$/, "")}/creator`));
}

/** Take an approved resource off the website at once (rights complaint, safety problem). Needs a written reason. */
export async function suspendResource(deps: ShopDeps, actor: Actor | null, id: string, reason: unknown, ip?: string | null) {
  assertCan(actor, "marketplace.moderate");
  const note = parseOrThrow(z.object({ reason: z.string().trim().min(20, "Write the reason (at least 20 characters). The creator is sent it.").max(2000) }), { reason }).reason;
  const [row] = await deps.db
    .update(products)
    .set({ status: "SUSPENDED", isPublished: false })
    .where(and(eq(products.id, id), eq(products.status, "APPROVED"), sql`${products.ownerId} IS NOT NULL`))
    .returning({ title: products.title, ownerId: products.ownerId, submissionCount: products.submissionCount });
  if (!row) throw new ConflictError("Only an approved creator resource can be taken down.");
  await deps.db.insert(resourceReviews).values({ productId: id, submission: row.submissionCount, reviewerId: actor.id, decision: "SUSPENDED", rubricVersion: RUBRIC_VERSION, note });
  await recordAudit(deps.db, { actorId: actor.id, action: "resource.suspended", entityType: "product", entityId: id, ip });
  await notifyCreator(deps, row.ownerId!, row.title, "SUSPENDED", note);
}

/** Put a suspended resource back on the website. */
export async function restoreResource(db: Db, actor: Actor | null, id: string, ip?: string | null) {
  assertCan(actor, "marketplace.moderate");
  const [row] = await db
    .update(products)
    .set({ status: "APPROVED", isPublished: true })
    .where(and(eq(products.id, id), eq(products.status, "SUSPENDED"), sql`${products.fileId} IS NOT NULL`))
    .returning({ submissionCount: products.submissionCount });
  if (!row) throw new ConflictError("Only a suspended resource can be restored.");
  await db.insert(resourceReviews).values({ productId: id, submission: row.submissionCount, reviewerId: actor.id, decision: "RESTORED", rubricVersion: RUBRIC_VERSION, note: "" });
  await recordAudit(db, { actorId: actor.id, action: "resource.restored", entityType: "product", entityId: id, ip });
}
