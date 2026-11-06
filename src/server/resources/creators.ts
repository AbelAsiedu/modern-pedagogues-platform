import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { format, money } from "../../lib/money";
import { SITE } from "../../lib/site";
import { recordAudit } from "../audit";
import { enforceRateLimit } from "../auth/rate-limit";
import { parseOrThrow } from "../auth/validation";
import type { Db } from "../db";
import { creatorPayouts, creatorProfiles, orders, productFiles, products, resourceReviews, roles, userRoles, users } from "../db/schema";
import { deliverEmail } from "../email/deliver";
import { resourceAlertMessage, resourceSubmittedMessage } from "../email/templates";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { mediaInfoByPath } from "../media/service";
import { can, type Actor } from "../permissions/authorize";
import { REVIEWED_FIELDS, uniqueSlug, type ShopDeps } from "../shop/service";
import { assertKnownTaxonomy } from "./taxonomy";
import { containsContactDetails, DECLARATION_VERSION, listingInput, priceFrom, readiness, type ReadinessInput } from "./quality";

/** Bump when the Creator Terms change materially. */
export const CREATOR_TERMS_VERSION = 1;
export const MAX_LISTINGS_PER_CREATOR = 30;

// ---------- becoming a creator ----------

const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number.");
export const creatorInput = z.object({
  displayName: z.string().trim().min(2, "Enter the name to show on your resources.").max(60).refine((v) => !containsContactDetails(v), "The name must not contain contact details."),
  bio: z.string().trim().max(500).default("").refine((v) => !containsContactDetails(v), "The bio must not contain email addresses, links or phone numbers."),
  payoutPhone: phone.optional().or(z.literal("").transform(() => undefined)),
  acceptTerms: z.literal(true, "Please accept the Creator Terms to continue."),
});

export async function getCreatorProfile(db: Db, userId: string) {
  const [row] = await db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId)).limit(1);
  return row ?? null;
}

/**
 * Any signed-in, verified account may become a creator by accepting the Creator Terms. This grants the "creator" role
 * itself (the normal role-change rules stop people granting roles to themselves, so this is a separate, narrow path).
 */
export async function becomeCreator(db: Db, actor: Actor | null, input: unknown, ip?: string | null) {
  if (!actor || actor.status !== "ACTIVE") throw new ForbiddenError("sign in to become a creator");
  const data = parseOrThrow(creatorInput, input); // a form with mistakes does not use up the allowance
  await enforceRateLimit(db, { key: `creator:join:${actor.id}`, limit: 5, windowSeconds: 86_400 });
  await db.transaction(async (tx) => {
    await tx
      .insert(creatorProfiles)
      .values({ userId: actor.id, displayName: data.displayName, bio: data.bio, payoutPhone: data.payoutPhone ?? null, termsVersion: CREATOR_TERMS_VERSION, termsAcceptedAt: new Date() })
      .onConflictDoUpdate({ target: creatorProfiles.userId, set: { displayName: data.displayName, bio: data.bio, payoutPhone: data.payoutPhone ?? null, termsVersion: CREATOR_TERMS_VERSION, termsAcceptedAt: new Date() } });
    const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.key, "creator")).limit(1);
    if (!role) throw new Error("creator role is not seeded");
    await tx.insert(userRoles).values({ userId: actor.id, roleId: role.id }).onConflictDoNothing();
    await recordAudit(tx, { actorId: actor.id, action: "creator.joined", entityType: "user", entityId: actor.id, metadata: { termsVersion: CREATOR_TERMS_VERSION }, ip });
  });
}

const profileInput = creatorInput.omit({ acceptTerms: true });

/** Change the name, bio or payout number shown/used for the signed-in creator. */
export async function updateCreatorProfile(db: Db, actor: Actor | null, input: unknown, ip?: string | null) {
  await requireCreator(db, actor);
  const data = parseOrThrow(profileInput, input);
  await db.update(creatorProfiles).set({ displayName: data.displayName, bio: data.bio, payoutPhone: data.payoutPhone ?? null }).where(eq(creatorProfiles.userId, actor!.id));
  await recordAudit(db, { actorId: actor!.id, action: "creator.profile_updated", entityType: "user", entityId: actor!.id, ip });
}

/** The signed-in creator's profile, or an error if they are not a creator or have been suspended. */
export async function requireCreator(db: Db, actor: Actor | null) {
  if (!actor || actor.status !== "ACTIVE" || !can(actor, "portal.creator")) throw new ForbiddenError("not a creator");
  const profile = await getCreatorProfile(db, actor.id);
  if (!profile) throw new ForbiddenError("no creator profile");
  if (profile.isSuspended) throw new ForbiddenError("creator account suspended");
  return profile;
}

// ---------- listings ----------

type ProductRow = typeof products.$inferSelect;

async function ownListing(db: Db, actor: Actor, id: string): Promise<ProductRow> {
  const [row] = await db.select().from(products).where(and(eq(products.id, id), eq(products.ownerId, actor.id))).limit(1);
  if (!row) throw new NotFoundError("resource not found");
  return row;
}

async function checkedListing(db: Db, actor: Actor, input: unknown) {
  const data = parseOrThrow(listingInput, input);
  const price = priceFrom(data, true);
  if (!price.ok) throw new ValidationError({ price: [price.message] }, price.message);
  await assertKnownTaxonomy(db, data.levelKeys, data.curriculumKeys);
  if (data.coverPath) {
    const m = await mediaInfoByPath(db, data.coverPath);
    if (!m || m.uploadedById !== actor.id) throw new ValidationError({ coverPath: ["Choose a picture you uploaded."] }, "cover not found");
  }
  return { data, priceMinor: price.pesewas };
}

export async function createListing(db: Db, actor: Actor | null, input: unknown, ip?: string | null) {
  const profile = await requireCreator(db, actor);
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(products).where(and(eq(products.ownerId, actor!.id), sql`${products.status} <> 'REJECTED'`));
  if (n >= MAX_LISTINGS_PER_CREATOR) throw new ConflictError(`You can have up to ${MAX_LISTINGS_PER_CREATOR} resources at once. Delete drafts you no longer need.`);
  const { data, priceMinor } = await checkedListing(db, actor!, input);
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
      authorName: data.authorName || profile.displayName,
      outcomes: data.outcomes,
      audience: data.audience,
      tableOfContents: data.tableOfContents,
      priceMinor,
      coverPath: data.coverPath,
      ownerId: actor!.id,
      status: "DRAFT",
      isPublished: false,
      createdById: actor!.id,
    })
    .returning({ id: products.id });
  await recordAudit(db, { actorId: actor!.id, action: "resource.created", entityType: "product", entityId: row!.id, ip });
  return row!.id;
}

const EDITABLE: readonly ProductRow["status"][] = ["DRAFT", "CHANGES_REQUESTED", "APPROVED"];

/**
 * Change a listing. Changing anything a reviewer judged (title, text, cover...) on an APPROVED listing takes it off the
 * website and back to DRAFT until it is approved again; changing only the price or making it free/paid does not.
 */
export async function updateListing(db: Db, actor: Actor | null, id: string, input: unknown, ip?: string | null) {
  await requireCreator(db, actor);
  const current = await ownListing(db, actor!, id);
  if (!EDITABLE.includes(current.status)) {
    throw new ConflictError(current.status === "IN_REVIEW" ? "This resource is being reviewed. You can edit it once the review is finished." : "This resource can no longer be edited.");
  }
  const { data, priceMinor } = await checkedListing(db, actor!, input);
  const next = { ...data, authorName: data.authorName || current.authorName };
  const changed = REVIEWED_FIELDS.some((f) => JSON.stringify(next[f]) !== JSON.stringify(current[f]));
  const backToDraft = current.status === "APPROVED" && changed;
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
      authorName: next.authorName,
      outcomes: data.outcomes,
      audience: data.audience,
      tableOfContents: data.tableOfContents,
      priceMinor,
      coverPath: data.coverPath,
      ...(backToDraft ? { status: "DRAFT" as const, isPublished: false } : {}),
    })
    .where(and(eq(products.id, id), eq(products.ownerId, actor!.id)));
  await recordAudit(db, { actorId: actor!.id, action: "resource.updated", entityType: "product", entityId: id, metadata: { sentBackToDraft: backToDraft }, ip });
  return { sentBackToDraft: backToDraft };
}

/** Hide or show an approved listing without a new review. */
export async function setListingVisibility(db: Db, actor: Actor | null, id: string, published: boolean, ip?: string | null) {
  await requireCreator(db, actor);
  const current = await ownListing(db, actor!, id);
  if (current.status !== "APPROVED" || !current.fileId) throw new ConflictError("Only an approved resource can be shown or hidden.");
  await db.update(products).set({ isPublished: published }).where(eq(products.id, id));
  await recordAudit(db, { actorId: actor!.id, action: published ? "resource.shown" : "resource.hidden", entityType: "product", entityId: id, ip });
}

/** Remove a resource that was never sold. A listing with orders can be hidden, not deleted. */
export async function deleteListing(db: Db, actor: Actor | null, id: string, ip?: string | null) {
  await requireCreator(db, actor);
  const current = await ownListing(db, actor!, id);
  if (current.status === "IN_REVIEW") throw new ConflictError("This resource is being reviewed. Delete it once the review is finished.");
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(orders).where(eq(orders.productId, id));
  if (n > 0) throw new ConflictError("This resource has been ordered, so it cannot be deleted. Use Hide instead.");
  await db.delete(products).where(eq(products.id, id));
  for (const f of [current.fileId, current.pendingFileId]) if (f) await db.delete(productFiles).where(eq(productFiles.id, f));
  await recordAudit(db, { actorId: actor!.id, action: "resource.deleted", entityType: "product", entityId: id, ip });
}

export async function listMyListings(db: Db, actor: Actor | null) {
  await requireCreator(db, actor);
  return db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      kind: products.kind,
      status: products.status,
      priceMinor: products.priceMinor,
      isPublished: products.isPublished,
      downloadCount: products.downloadCount,
      submittedAt: products.submittedAt,
      sales: sql<number>`(SELECT count(*)::int FROM orders o WHERE o.product_id = ${products.id} AND o.status = 'PAID')`,
    })
    .from(products)
    .where(eq(products.ownerId, actor!.id))
    .orderBy(desc(products.createdAt));
}

/** What is still missing before this listing can be submitted. */
export async function listingReadiness(db: Db, p: ProductRow, declared: boolean): Promise<string[]> {
  const fileId = p.pendingFileId ?? p.fileId;
  const [file] = fileId ? await db.select({ pages: productFiles.pages }).from(productFiles).where(eq(productFiles.id, fileId)).limit(1) : [];
  const cover = p.coverPath ? await mediaInfoByPath(db, p.coverPath) : null;
  const input: ReadinessInput = {
    title: p.title,
    summary: p.summary,
    description: p.description,
    kind: p.kind,
    subject: p.subject,
    levelKeys: p.levelKeys,
    outcomes: p.outcomes,
    audience: p.audience,
    tableOfContents: p.tableOfContents,
    authorName: p.authorName,
    coverPath: p.coverPath,
    cover: cover ? { width: cover.width, height: cover.height } : null,
    file: file ? { pages: file.pages ?? 0, problems: [] } : null,
    declared,
  };
  return readiness(input);
}

export async function getMyListing(db: Db, actor: Actor | null, id: string) {
  await requireCreator(db, actor);
  const p = await ownListing(db, actor!, id);
  const [live, pending] = await Promise.all(
    [p.fileId, p.pendingFileId].map(async (fid) =>
      fid ? (await db.select({ filename: productFiles.filename, byteSize: productFiles.byteSize, pages: productFiles.pages }).from(productFiles).where(eq(productFiles.id, fid)).limit(1))[0] ?? null : null,
    ),
  );
  const reviews = await db
    .select({ id: resourceReviews.id, submission: resourceReviews.submission, decision: resourceReviews.decision, scores: resourceReviews.scores, note: resourceReviews.note, createdAt: resourceReviews.createdAt })
    .from(resourceReviews)
    .where(eq(resourceReviews.productId, id))
    .orderBy(desc(resourceReviews.createdAt));
  const unmet = await listingReadiness(db, p, true);
  return { product: p, liveFile: live, pendingFile: pending, reviews, unmet };
}

/** Send a complete listing to the reviewers. Records the creator's declarations with the date and version. */
export async function submitForReview(deps: ShopDeps, actor: Actor | null, id: string, declarationsAccepted: boolean, ip?: string | null) {
  const { db } = deps;
  const profile = await requireCreator(db, actor);
  const p = await ownListing(db, actor!, id);
  if (p.status !== "DRAFT" && p.status !== "CHANGES_REQUESTED") {
    throw new ConflictError(p.status === "IN_REVIEW" ? "This resource is already waiting for review." : "This resource cannot be submitted.");
  }
  const unmet = await listingReadiness(db, p, declarationsAccepted);
  if (unmet.length > 0) throw new ConflictError(`It is not ready to submit yet. ${unmet.join(" ")}`);
  const [row] = await db
    .update(products)
    .set({ status: "IN_REVIEW", isPublished: false, submittedAt: new Date(), submissionCount: sql`${products.submissionCount} + 1`, declaredAt: new Date(), declarationVersion: DECLARATION_VERSION })
    .where(and(eq(products.id, id), eq(products.ownerId, actor!.id), inArray(products.status, ["DRAFT", "CHANGES_REQUESTED"])))
    .returning({ id: products.id });
  if (!row) throw new ConflictError("This resource is already waiting for review.");
  await recordAudit(db, { actorId: actor!.id, action: "resource.submitted", entityType: "product", entityId: id, ip });
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, actor!.id)).limit(1);
  const base = deps.appUrl.replace(/\/$/, "");
  if (u) await deliverEmail(deps, resourceSubmittedMessage(u.email, profile.displayName, p.title, `${base}/creator/${id}`));
  await deliverEmail(deps, resourceAlertMessage(deps.notifyEmail ?? SITE.email, profile.displayName, p.title, `${base}/admin/review/${id}`));
}

// ---------- earnings ----------

export async function creatorEarnings(db: Db, actor: Actor | null) {
  await requireCreator(db, actor);
  return balanceFor(db, actor!.id);
}

export async function balanceFor(db: Db, creatorId: string) {
  const [e] = await db
    .select({ earned: sql<string>`coalesce(sum(${orders.creatorShareMinor}), 0)::text`, sales: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.creatorId, creatorId), eq(orders.status, "PAID")));
  const [p] = await db.select({ paid: sql<string>`coalesce(sum(${creatorPayouts.amountMinor}), 0)::text` }).from(creatorPayouts).where(eq(creatorPayouts.creatorId, creatorId));
  const earned = BigInt(e?.earned ?? "0");
  const paidOut = BigInt(p?.paid ?? "0");
  return { earned, paidOut, balance: earned - paidOut, sales: e?.sales ?? 0 };
}

export const moneyText = (pesewas: bigint) => format(money(pesewas, "GHS"));
