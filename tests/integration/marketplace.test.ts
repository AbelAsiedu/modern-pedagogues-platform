import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { creatorPayouts, creatorProfiles, orders, productFiles, products, resourceReviews } from "@/server/db/schema";
import { MemoryMailer } from "@/server/email/mailer";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { createLogger } from "@/server/logger";
import { saveImage } from "@/server/media/service";
import type { Actor } from "@/server/permissions/authorize";
import {
  becomeCreator, createListing, creatorEarnings, deleteListing, getMyListing, listMyListings, setListingVisibility, submitForReview, updateListing,
} from "@/server/resources/creators";
import { listCreatorBalances, recordPayout, setCreatorSuspended } from "@/server/resources/payouts";
import { decideResource, getReviewFile, listReviewQueue, restoreResource, suspendResource } from "@/server/resources/review";
import {
  attachProductFile, getDownload, getFreeDownload, getPublicProduct, listPublicProducts, markOrderPaid, placeOrder, type ShopDeps,
} from "@/server/shop/service";
import { makeActor, openTestDb, resetData } from "../support/harness";
import { makePdf } from "../support/pdf";

const { pool, db } = openTestDb();
afterAll(() => pool.end());
beforeEach(() => resetData(db));

let PDF: Buffer;
let COVER: Buffer;
beforeAll(async () => {
  PDF = await makePdf(20);
  COVER = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#123456" } }).png().toBuffer();
});

function deps(): ShopDeps & { mailer: MemoryMailer } {
  const mailer = new MemoryMailer();
  return { db, mailer, log: createLogger("silent"), appUrl: "https://tmp.example", notifyEmail: "inbox@tmp.example" };
}

const SCORES_GOOD = { accuracy: 4, originality: 4, safety: 4, structure: 3, pedagogy: 3, presentation: 3, inclusion: 3, value: 3 };

async function creator(email = "teacher@example.com", name = "Ama Teacher"): Promise<Actor> {
  const actor = await makeActor(db, email, ["parent"], "ACTIVE", name);
  await becomeCreator(db, actor, { displayName: name, bio: "Maths teacher", payoutPhone: "0241234567", acceptTerms: true });
  return { ...actor, roles: [...actor.roles, "creator"] };
}

const fields = (over: Record<string, unknown> = {}) => ({
  title: "JHS Integrated Science: Complete Course",
  summary: "A complete three-year JHS Integrated Science course with worked examples, practice questions and full answers for every unit.",
  description: "This course walks a learner through the whole JHS Integrated Science syllabus. Each unit begins with a short explanation, then worked examples, then graded practice questions with full answers, so learners can check themselves as they go. " + "Learners also get a revision checklist at the end of every unit, and a final mock test with a marking scheme.",
  kind: "COURSE",
  subject: "Integrated Science",
  levelKeys: ["jhs"],
  curriculumKeys: ["ges"],
  language: "English",
  authorName: "",
  outcomes: "Explain the structure of a plant cell and its parts\nCarry out and record a simple investigation\nSolve problems on force and motion",
  audience: "JHS learners preparing for the BECE who know basic arithmetic.",
  tableOfContents: "Unit 1: Living things and their cells. Unit 2: Matter and its properties. Unit 3: Energy and forces.",
  isFree: false,
  price: "40",
  coverPath: "",
  ...over,
});

/** A creator listing with cover and PDF attached, ready to submit. */
async function readyListing(who: Actor, over: Record<string, unknown> = {}) {
  const pic = await saveImage(db, who, { filename: "cover.png", bytes: COVER });
  const id = await createListing(db, who, fields({ coverPath: pic.path, ...over }));
  await attachProductFile(db, who, id, { filename: "course.pdf", bytes: PDF });
  return id;
}

/** The listing's current fields, so an edit changes only what the test means to change. */
async function current(id: string, over: Record<string, unknown> = {}) {
  const [p] = await db.select().from(products).where(eq(products.id, id));
  return fields({ coverPath: p!.coverPath ?? "", authorName: p!.authorName, price: String(Number(p!.priceMinor) / 100), isFree: p!.priceMinor === 0n, ...over });
}

async function approved(who: Actor, reviewer: Actor, over: Record<string, unknown> = {}) {
  const id = await readyListing(who, over);
  await submitForReview(deps(), who, id, true);
  const [p] = await db.select().from(products).where(eq(products.id, id));
  await decideResource(deps(), reviewer, id, { decision: "APPROVED", submission: p!.submissionCount, scores: SCORES_GOOD, note: "" });
  return id;
}

describe("becoming a creator", () => {
  it("needs an active account and accepted terms, grants the creator role, and audits it", async () => {
    await expect(becomeCreator(db, null, { displayName: "Ama", acceptTerms: true })).rejects.toBeInstanceOf(ForbiddenError);
    const pending = await makeActor(db, "p@example.com", ["parent"], "PENDING_VERIFICATION");
    await expect(becomeCreator(db, pending, { displayName: "Ama", acceptTerms: true })).rejects.toBeInstanceOf(ForbiddenError);
    const user = await makeActor(db, "u@example.com", ["parent"]);
    await expect(becomeCreator(db, user, { displayName: "Ama", acceptTerms: false })).rejects.toBeInstanceOf(ValidationError);
    await expect(becomeCreator(db, user, { displayName: "Call 0241234567", acceptTerms: true })).rejects.toBeInstanceOf(ValidationError);
    await becomeCreator(db, user, { displayName: "Ama Teacher", acceptTerms: true });
    expect((await db.select().from(creatorProfiles))[0]).toMatchObject({ displayName: "Ama Teacher", termsVersion: 1, isSuspended: false });
  });

  it("does not let a visitor who is not a creator touch listings", async () => {
    const plain = await makeActor(db, "u@example.com", ["parent"]);
    await expect(createListing(db, plain, fields())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listMyListings(db, plain)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("a creator's listing", () => {
  it("is a private draft that the public cannot see, and only its owner can open", async () => {
    const a = await creator("a@example.com");
    const b = await creator("b@example.com", "Kofi Teacher");
    const id = await readyListing(a);
    expect(await listPublicProducts(db)).toHaveLength(0);
    await expect(getMyListing(db, b, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateListing(db, b, id, fields())).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteListing(db, b, id)).rejects.toBeInstanceOf(NotFoundError);
    const mine = await getMyListing(db, a, id);
    expect(mine.product.status).toBe("DRAFT");
    expect(mine.product.authorName).toBe("Ama Teacher");
    expect(mine.pendingFile?.pages).toBe(20);
    expect(mine.liveFile).toBeNull();
  });

  it("holds creators to the price floor and the real level list, and cover pictures they uploaded", async () => {
    const a = await creator("a@example.com");
    const b = await creator("b@example.com", "Kofi Teacher");
    await expect(createListing(db, a, fields({ price: "4" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createListing(db, a, fields({ levelKeys: ["university"] }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createListing(db, a, fields({ summary: "Email me on x@y.com for the answers to every exercise in this book" }))).rejects.toBeInstanceOf(ValidationError);
    const theirs = await saveImage(db, b, { filename: "c.png", bytes: COVER });
    await expect(createListing(db, a, fields({ coverPath: theirs.path }))).rejects.toBeInstanceOf(ValidationError);
    await createListing(db, a, fields({ isFree: true, price: "" }));
    expect((await db.select().from(products))[0]?.priceMinor).toBe(0n);
  });

  it("cannot be submitted until everything the standard requires is in place", async () => {
    const a = await creator();
    const id = await createListing(db, a, fields({ summary: "Too short a summary", outcomes: "One only" }));
    await expect(submitForReview(deps(), a, id, true)).rejects.toBeInstanceOf(ConflictError);
    const unmet = (await getMyListing(db, a, id)).unmet.join("\n");
    expect(unmet).toMatch(/summary/);
    expect(unmet).toMatch(/3 learning outcomes/);
    expect(unmet).toMatch(/cover/);
    expect(unmet).toMatch(/Upload the PDF/);
    expect(await db.select().from(resourceReviews)).toHaveLength(0);
  });

  it("needs the declarations, then goes to review and emails the creator and TMP", async () => {
    const a = await creator();
    const id = await readyListing(a);
    await expect(submitForReview(deps(), a, id, false)).rejects.toBeInstanceOf(ConflictError);
    const d = deps();
    await submitForReview(d, a, id, true);
    expect(d.mailer.sent.map((m) => m.to).sort()).toEqual(["inbox@tmp.example", "teacher@example.com"]);
    const [p] = await db.select().from(products);
    expect(p).toMatchObject({ status: "IN_REVIEW", submissionCount: 1, declarationVersion: 1 });
    expect(p?.declaredAt).not.toBeNull();
    await expect(submitForReview(deps(), a, id, true)).rejects.toBeInstanceOf(ConflictError);
    // While in review the creator cannot change or replace anything or delete it.
    await expect(updateListing(db, a, id, fields())).rejects.toBeInstanceOf(ConflictError);
    await expect(attachProductFile(db, a, id, { filename: "again.pdf", bytes: PDF })).rejects.toBeInstanceOf(ConflictError);
    await expect(deleteListing(db, a, id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects PDFs that are unreadable, locked, or carry scripts, and counts pages", async () => {
    const a = await creator();
    const id = await createListing(db, a, fields());
    await expect(attachProductFile(db, a, id, { filename: "x.pdf", bytes: Buffer.from("%PDF-1.4 not really") })).rejects.toBeInstanceOf(ValidationError);
    await expect(attachProductFile(db, a, id, { filename: "x.pdf", bytes: await makePdf(20, { javascript: true }) })).rejects.toBeInstanceOf(ValidationError);
    expect(await db.select().from(productFiles)).toHaveLength(0);
    await attachProductFile(db, a, id, { filename: "ok.pdf", bytes: await makePdf(3) });
    // Too few pages for a course shows up as a requirement, not a crash.
    expect((await getMyListing(db, a, id)).unmet.join("\n")).toMatch(/at least 15 pages; this PDF has 3/);
  });

  it("cannot upload files to TMP's own products or to another creator's resource", async () => {
    const a = await creator("a@example.com");
    const b = await creator("b@example.com", "Kofi Teacher");
    const admin = await makeActor(db, "admin@example.com", ["admin"]);
    const { createProduct } = await import("@/server/shop/service");
    const own = await createProduct(db, admin, { title: "TMP own worksheet pack", summary: "Ours.", price: "25" });
    const theirs = await createListing(db, b, fields());
    await expect(attachProductFile(db, a, own, { filename: "x.pdf", bytes: PDF })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(attachProductFile(db, a, theirs, { filename: "x.pdf", bytes: PDF })).rejects.toBeInstanceOf(ForbiddenError);
    // and staff cannot overwrite a creator's file or edit their listing through the staff API
    await expect(attachProductFile(db, admin, theirs, { filename: "x.pdf", bytes: PDF })).rejects.toBeInstanceOf(ForbiddenError);
    const { updateProduct, deleteProduct } = await import("@/server/shop/service");
    await expect(updateProduct(db, admin, theirs, { title: "Hijacked", summary: "x", price: "10" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteProduct(db, admin, theirs)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("limits each creator's stored PDFs and uploads", async () => {
    const a = await creator();
    const id = await createListing(db, a, fields());
    for (let i = 0; i < 10; i++) await attachProductFile(db, a, id, { filename: `v${i}.pdf`, bytes: await makePdf(2) });
    await expect(attachProductFile(db, a, id, { filename: "v11.pdf", bytes: await makePdf(2) })).rejects.toMatchObject({ code: expect.stringMatching(/RATE|LIMIT/i) });
  });
});

describe("review", () => {
  it("is a queue only moderators can see, and the creator cannot review their own work", async () => {
    const a = await creator();
    const id = await readyListing(a);
    await submitForReview(deps(), a, id, true);
    const mod = await makeActor(db, "mod@example.com", ["content_manager"]);
    expect((await listReviewQueue(db, mod)).map((q) => q.id)).toEqual([id]);
    for (const who of [a, await makeActor(db, "f@example.com", ["finance_manager"]), await makeActor(db, "p@example.com", ["parent"]), null]) {
      await expect(listReviewQueue(db, who)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getReviewFile(db, who, id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(decideResource(deps(), who, id, { decision: "APPROVED", submission: 1, scores: SCORES_GOOD })).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect((await getReviewFile(db, mod, id))?.filename).toBe("course.pdf");
    // A moderator who is also the owner may not decide it.
    const both = await makeActor(db, "both@example.com", ["content_manager"]);
    await becomeCreator(db, both, { displayName: "Both Of Us", acceptTerms: true });
    const own = await readyListing({ ...both, roles: ["content_manager", "creator"] });
    await submitForReview(deps(), { ...both, roles: ["content_manager", "creator"] }, own, true);
    await expect(decideResource(deps(), both, own, { decision: "APPROVED", submission: 1, scores: SCORES_GOOD })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("approves only when every criterion passes and the average is high enough", async () => {
    const a = await creator();
    const mod = await makeActor(db, "mod@example.com", ["content_manager"]);
    const id = await readyListing(a);
    await submitForReview(deps(), a, id, true);
    const decide = (scores: Record<string, number>) => decideResource(deps(), mod, id, { decision: "APPROVED", submission: 1, scores, note: "" });
    await expect(decide({})).rejects.toBeInstanceOf(ConflictError);
    await expect(decide({ ...SCORES_GOOD, safety: 2 })).rejects.toBeInstanceOf(ConflictError);
    await expect(decide({ ...SCORES_GOOD, accuracy: 5 })).rejects.toBeInstanceOf(ConflictError);
    await expect(decide({ accuracy: 3, originality: 3, safety: 3, structure: 3, pedagogy: 3, presentation: 3, inclusion: 3, value: 3 })).rejects.toBeInstanceOf(ConflictError); // average 3.0 < 3.25
    expect((await db.select().from(products))[0]?.status).toBe("IN_REVIEW");
    expect(await listPublicProducts(db)).toHaveLength(0);
  });

  it("publishes an approved resource with its file, emails the creator, and keeps the rubric on record", async () => {
    const a = await creator();
    const mod = await makeActor(db, "mod@example.com", ["content_manager"]);
    const id = await readyListing(a);
    await submitForReview(deps(), a, id, true);
    const d = deps();
    await decideResource(d, mod, id, { decision: "APPROVED", submission: 1, scores: SCORES_GOOD, note: "Lovely work." });
    expect(d.mailer.last()).toMatchObject({ to: "teacher@example.com" });
    const [p] = await db.select().from(products);
    expect(p).toMatchObject({ status: "APPROVED", isPublished: true, pendingFileId: null, pageCount: 20 });
    expect(p?.fileId).not.toBeNull();
    expect((await listPublicProducts(db))).toHaveLength(1);
    expect((await db.select().from(resourceReviews))[0]).toMatchObject({ decision: "APPROVED", rubricVersion: 1, reviewerId: mod.id });
  });

  it("needs specific feedback to ask for changes or decline, and lets the creator fix and resubmit", async () => {
    const a = await creator();
    const mod = await makeActor(db, "mod@example.com", ["content_manager"]);
    const id = await readyListing(a);
    await submitForReview(deps(), a, id, true);
    await expect(decideResource(deps(), mod, id, { decision: "CHANGES_REQUESTED", submission: 1, note: "fix it" })).rejects.toBeInstanceOf(ValidationError);
    await decideResource(deps(), mod, id, { decision: "CHANGES_REQUESTED", submission: 1, note: "Unit 2 answers are wrong on page 14; please correct them." });
    expect((await getMyListing(db, a, id)).product.status).toBe("CHANGES_REQUESTED");
    await updateListing(db, a, id, await current(id, { title: "JHS Integrated Science Complete Course v2" }));
    await submitForReview(deps(), a, id, true);
    expect((await db.select().from(products))[0]?.submissionCount).toBe(2);
    // A decision made on the old submission cannot be applied to the new one.
    await expect(decideResource(deps(), mod, id, { decision: "REJECTED", submission: 1, note: "Declined for reasons given earlier." })).rejects.toBeInstanceOf(ConflictError);
  });

  it("cannot be decided twice, even by two reviewers at once", async () => {
    const a = await creator();
    const m1 = await makeActor(db, "m1@example.com", ["content_manager"]);
    const m2 = await makeActor(db, "m2@example.com", ["admin"]);
    const id = await readyListing(a);
    await submitForReview(deps(), a, id, true);
    const results = await Promise.allSettled([
      decideResource(deps(), m1, id, { decision: "APPROVED", submission: 1, scores: SCORES_GOOD }),
      decideResource(deps(), m2, id, { decision: "REJECTED", submission: 1, note: "Not suitable for our standard, sorry." }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(resourceReviews)).toHaveLength(1);
  });
});

describe("approved resources", () => {
  it("go back to draft and off the site when reviewed content changes, but not for a price change", async () => {
    const a = await creator();
    const mod = await makeActor(db, "mod@example.com", ["content_manager"]);
    const id = await approved(a, mod);
    expect((await updateListing(db, a, id, await current(id, { price: "55" }))).sentBackToDraft).toBe(false);
    expect((await db.select().from(products))[0]).toMatchObject({ status: "APPROVED", isPublished: true, priceMinor: 5500n });
    expect((await updateListing(db, a, id, await current(id, { price: "55", title: "A completely different title now" }))).sentBackToDraft).toBe(true);
    expect((await db.select().from(products))[0]).toMatchObject({ status: "DRAFT", isPublished: false });
    expect(await listPublicProducts(db)).toHaveLength(0);
  });

  it("keep the approved file live while a replacement waits for review", async () => {
    const a = await creator();
    const mod = await makeActor(db, "mod@example.com", ["content_manager"]);
    const id = await approved(a, mod);
    const [before] = await db.select().from(products);
    await attachProductFile(db, a, id, { filename: "v2.pdf", bytes: await makePdf(25) });
    const [after] = await db.select().from(products);
    expect(after).toMatchObject({ status: "DRAFT", isPublished: false, fileId: before!.fileId });
    expect(after?.pendingFileId).not.toBeNull();
    expect(after?.pendingFileId).not.toBe(before!.fileId);
    await submitForReview(deps(), a, id, true);
    await decideResource(deps(), mod, id, { decision: "APPROVED", submission: 2, scores: SCORES_GOOD });
    const [done] = await db.select().from(products);
    expect(done).toMatchObject({ status: "APPROVED", isPublished: true, pendingFileId: null, pageCount: 25 });
    expect(await db.select().from(productFiles)).toHaveLength(1); // the old file was removed
  });

  it("can be hidden and shown by the creator without a new review", async () => {
    const a = await creator();
    const mod = await makeActor(db, "mod@example.com", ["content_manager"]);
    const id = await approved(a, mod);
    await setListingVisibility(db, a, id, false);
    expect(await listPublicProducts(db)).toHaveLength(0);
    await setListingVisibility(db, a, id, true);
    expect(await listPublicProducts(db)).toHaveLength(1);
  });

  it("can be taken down by moderators with a reason, and restored", async () => {
    const a = await creator();
    const mod = await makeActor(db, "mod@example.com", ["content_manager"]);
    const id = await approved(a, mod);
    await expect(suspendResource(deps(), mod, id, "short")).rejects.toBeInstanceOf(ValidationError);
    await expect(suspendResource(deps(), a, id, "I would like to take this one down myself please")).rejects.toBeInstanceOf(ForbiddenError);
    const d = deps();
    await suspendResource(d, mod, id, "A publisher has told us pages 3 to 9 are copied from their textbook.");
    expect(d.mailer.last()?.to).toBe("teacher@example.com");
    expect(await getPublicProduct(db, (await db.select().from(products))[0]!.slug)).toBeNull();
    await expect(setListingVisibility(db, a, id, true)).rejects.toBeInstanceOf(ConflictError);
    await restoreResource(db, mod, id);
    expect(await listPublicProducts(db)).toHaveLength(1);
    await expect(restoreResource(db, mod, id)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("downloads: free and paid", () => {
  it("lets any signed-in account download a free resource, counts it, and refuses visitors", async () => {
    const a = await creator();
    const mod = await makeActor(db, "mod@example.com", ["content_manager"]);
    const id = await approved(a, mod, { isFree: true, price: "" });
    const [p] = await db.select().from(products).where(eq(products.id, id));
    const reader = await makeActor(db, "r@example.com", ["student"]);
    expect(await getFreeDownload(db, null, p!.slug)).toBeNull();
    expect(await getFreeDownload(db, await makeActor(db, "s@example.com", ["student"], "SUSPENDED"), p!.slug)).toBeNull();
    const file = await getFreeDownload(db, reader, p!.slug);
    expect(file?.contentType).toBe("application/pdf");
    expect(file?.data.equals(PDF)).toBe(true);
    await getFreeDownload(db, reader, p!.slug);
    expect((await db.select().from(products))[0]?.downloadCount).toBe(2);
  });

  it("never gives a paid resource through the free route, and refuses to order a free one", async () => {
    const a = await creator();
    const mod = await makeActor(db, "mod@example.com", ["content_manager"]);
    const paid = await approved(a, mod);
    const [p] = await db.select().from(products).where(eq(products.id, paid));
    const reader = await makeActor(db, "r@example.com", ["student"]);
    expect(await getFreeDownload(db, reader, p!.slug)).toBeNull();
    expect(await getFreeDownload(db, a, p!.slug)).toBeNull();
    const free = await approved(a, mod, { isFree: true, price: "", title: "Free worksheet pack for JHS science" });
    const [f] = await db.select().from(products).where(eq(products.id, free));
    await expect(placeOrder(deps(), reader, f!.slug)).rejects.toBeInstanceOf(ConflictError);
  });

  it("keeps a paid resource locked until the buyer's payment is confirmed, and takes it away if it is taken down", async () => {
    const a = await creator();
    const mod = await makeActor(db, "mod@example.com", ["content_manager"]);
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const id = await approved(a, mod);
    const [p] = await db.select().from(products).where(eq(products.id, id));
    const buyer = await makeActor(db, "b@example.com", ["parent"]);
    await expect(placeOrder(deps(), a, p!.slug)).rejects.toBeInstanceOf(ConflictError); // not your own
    const { order } = await placeOrder(deps(), buyer, p!.slug);
    expect(await getDownload(db, buyer, order.id)).toBeNull();
    await markOrderPaid(deps(), admin, order.id, "MP240101.1234.A56789");
    expect((await getDownload(db, buyer, order.id))?.data.equals(PDF)).toBe(true);
    await suspendResource(deps(), mod, id, "A rights complaint has been upheld against this file.");
    expect(await getDownload(db, buyer, order.id)).toBeNull();
    await restoreResource(db, mod, id);
    expect(await getDownload(db, buyer, order.id)).not.toBeNull();
  });
});

describe("the split and payouts", () => {
  async function sale(price = "40") {
    const a = await creator();
    const mod = await makeActor(db, "mod@example.com", ["content_manager"]);
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const finance = await makeActor(db, "f@example.com", ["finance_manager"]);
    const id = await approved(a, mod, { price });
    const [p] = await db.select().from(products).where(eq(products.id, id));
    const buyer = await makeActor(db, "b@example.com", ["parent"]);
    const { order } = await placeOrder(deps(), buyer, p!.slug);
    return { a, mod, admin, finance, id, order, buyer };
  }

  it("fixes the 70/30 split when payment is confirmed, and later rate changes do not touch it", async () => {
    const { a, admin, order } = await sale("40");
    await markOrderPaid(deps(), admin, order.id, "MP240101.1234.A56789");
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o).toMatchObject({ creatorId: a.id, commissionBps: 3000, creatorShareMinor: 2800n, platformShareMinor: 1200n });
    expect(await creatorEarnings(db, a)).toMatchObject({ earned: 2800n, paidOut: 0n, balance: 2800n, sales: 1 });
  });

  it("does not split TMP's own sales", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const { createProduct } = await import("@/server/shop/service");
    const id = await createProduct(db, admin, { title: "TMP own worksheet pack", summary: "Our own.", price: "25" });
    await attachProductFile(db, admin, id, { filename: "own.pdf", bytes: PDF });
    await db.update(products).set({ isPublished: true }).where(eq(products.id, id));
    const buyer = await makeActor(db, "b@example.com", ["parent"]);
    const [p] = await db.select().from(products);
    const { order } = await placeOrder(deps(), buyer, p!.slug);
    await markOrderPaid(deps(), admin, order.id, "MP240101.1234.A56789");
    expect((await db.select().from(orders))[0]).toMatchObject({ creatorId: null, creatorShareMinor: null });
  });

  it("records payouts that cannot exceed what is owed, only for finance staff", async () => {
    const { a, admin, finance, order, mod } = await sale("40");
    await markOrderPaid(deps(), admin, order.id, "MP240101.1234.A56789");
    const pay = (who: Actor | null, amount: string, reference = "MP-PAYOUT-0001") => recordPayout(deps(), who, a.id, { amount, reference });
    for (const who of [a, mod, null]) await expect(pay(who, "10")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(pay(finance, "28.01")).rejects.toBeInstanceOf(ConflictError);
    await expect(pay(finance, "0")).rejects.toBeInstanceOf(ValidationError);
    await expect(pay(finance, "abc")).rejects.toBeInstanceOf(ValidationError);
    await expect(pay(finance, "10", "")).rejects.toBeInstanceOf(ValidationError);
    const d = deps();
    await recordPayout(d, finance, a.id, { amount: "10", reference: "MP-PAYOUT-0001" });
    expect(d.mailer.last()?.to).toBe("teacher@example.com");
    expect(await creatorEarnings(db, a)).toMatchObject({ paidOut: 1000n, balance: 1800n });
    const rows = await listCreatorBalances(db, finance);
    expect(rows[0]).toMatchObject({ earned: 2800n, paid: 1000n, balance: 1800n, payoutPhone: "0241234567" });
    // Two payouts at once cannot overpay.
    const results = await Promise.allSettled([pay(finance, "18", "MP-PAYOUT-0002"), pay(finance, "18", "MP-PAYOUT-0003")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await creatorEarnings(db, a)).balance).toBe(0n);
    expect(await db.select().from(creatorPayouts)).toHaveLength(2);
  });

  it("lets only creator managers suspend a creator, who then cannot create, upload or submit", async () => {
    const { a, admin, mod, id } = await sale();
    await expect(setCreatorSuspended(db, mod, a.id, true)).rejects.toBeInstanceOf(ForbiddenError);
    await setCreatorSuspended(db, admin, a.id, true);
    await expect(createListing(db, a, fields({ title: "Another resource for the same creator" }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(attachProductFile(db, a, id, { filename: "v2.pdf", bytes: PDF })).rejects.toBeInstanceOf(ForbiddenError);
    await setCreatorSuspended(db, admin, a.id, false);
    await createListing(db, a, fields({ title: "Another resource for the same creator" }));
  });
});
