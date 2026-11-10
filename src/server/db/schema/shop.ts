import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, ts, users } from "./identity";
import { bytea } from "./media";

export const orderStatus = pgEnum("order_status", ["PENDING_PAYMENT", "PAID", "CANCELLED"]);
export const resourceKind = pgEnum("resource_kind", ["BOOK", "COURSE", "STUDY_GUIDE", "WORKSHEET", "PAST_QUESTIONS", "LESSON_PLAN", "OTHER"]);
/** DRAFT -> IN_REVIEW -> APPROVED (or CHANGES_REQUESTED / REJECTED). SUSPENDED is a takedown by staff. */
export const resourceStatus = pgEnum("resource_status", ["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "SUSPENDED"]);

/** A downloadable resource (a PDF). PRIVATE: only ever served to a buyer whose order is paid, or to staff. */
export const productFiles = pgTable("product_files", {
  id: id(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256").notNull(),
  /** Page count and reviewer notes (for example "contains 3 web links") from the automatic PDF inspection. */
  pages: integer("pages"),
  inspectionNotes: text("inspection_notes").array().notNull().default(sql`'{}'::text[]`),
  data: bytea("data").notNull(),
  uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/**
 * A digital resource (book, course, study guide...). Owned by TMP (owner_id null) or by a creator. Free when
 * price_minor = 0. Visible to the public only when status = APPROVED, is_published, and a reviewed file is attached.
 */
export const products = pgTable(
  "products",
  {
    id: id(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    description: text("description").notNull().default(""),
    /** Pesewas. Money is never a float. */
    priceMinor: bigint("price_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull().default("GHS"),
    /** A picture from the media library (/media/<id>.jpg). */
    coverPath: text("cover_path"),
    /** The reviewed file buyers receive. */
    fileId: uuid("file_id").references(() => productFiles.id, { onDelete: "restrict" }),
    /** A creator's newly uploaded file awaiting review. Becomes file_id when approved. */
    pendingFileId: uuid("pending_file_id").references(() => productFiles.id, { onDelete: "restrict" }),
    kind: resourceKind("kind").notNull().default("OTHER"),
    status: resourceStatus("status").notNull().default("DRAFT"),
    /** null = sold by TMP itself. */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "restrict" }),
    authorName: text("author_name").notNull().default(""),
    subject: text("subject").notNull().default(""),
    levelKeys: text("level_keys").array().notNull().default(sql`'{}'::text[]`),
    curriculumKeys: text("curriculum_keys").array().notNull().default(sql`'{}'::text[]`),
    language: text("language").notNull().default("English"),
    outcomes: text("outcomes").array().notNull().default(sql`'{}'::text[]`),
    audience: text("audience").notNull().default(""),
    tableOfContents: text("table_of_contents").notNull().default(""),
    /** Pages of the live (reviewed) file. */
    pageCount: integer("page_count"),
    downloadCount: integer("download_count").notNull().default(0),
    declaredAt: ts("declared_at"),
    declarationVersion: integer("declaration_version"),
    submittedAt: ts("submitted_at"),
    submissionCount: integer("submission_count").notNull().default(0),
    approvedAt: ts("approved_at"),
    isPublished: boolean("is_published").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("products_slug_uq").on(t.slug),
    index("products_public_idx").on(t.status, t.isPublished, t.sortOrder),
    index("products_owner_idx").on(t.ownerId, t.status),
    check("products_price_not_negative", sql`${t.priceMinor} >= 0`),
    check("products_published_needs_file_and_approval", sql`NOT ${t.isPublished} OR (${t.fileId} IS NOT NULL AND ${t.status} = 'APPROVED')`),
  ],
);

/**
 * A purchase. Payment is confirmed by TMP staff after the buyer pays by MoMo, with the MoMo transaction id kept
 * as evidence; automatic Paystack confirmation will use the same table. The title and price are copied onto the
 * order so later edits to a product never change what a buyer agreed to.
 */
export const orders = pgTable(
  "orders",
  {
    id: id(),
    /** Short code the buyer quotes as the MoMo payment reference, e.g. TMP-7K2Q9X. */
    reference: text("reference").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
    productTitle: text("product_title").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull().default("GHS"),
    status: orderStatus("status").notNull().default("PENDING_PAYMENT"),
    /** MoMo transaction id or similar, recorded by staff when confirming payment. */
    paymentNote: text("payment_note"),
    /** How it was paid: "paystack" (confirmed automatically) or "manual" (a staff member matched a MoMo payment). */
    paymentMethod: text("payment_method"),
    paidAt: ts("paid_at"),
    paidById: uuid("paid_by_id").references(() => users.id, { onDelete: "set null" }),
    /** Set when payment is confirmed, for creator-owned products: the split is fixed at that moment. */
    creatorId: uuid("creator_id").references(() => users.id, { onDelete: "restrict" }),
    commissionBps: integer("commission_bps"),
    creatorShareMinor: bigint("creator_share_minor", { mode: "bigint" }),
    platformShareMinor: bigint("platform_share_minor", { mode: "bigint" }),
    cancelledAt: ts("cancelled_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("orders_reference_uq").on(t.reference),
    index("orders_user_idx").on(t.userId, t.createdAt),
    index("orders_status_idx").on(t.status, t.createdAt),
    /** A person has at most one live (unpaid or paid) order per product, so they cannot pay twice by accident. */
    uniqueIndex("orders_one_live_per_product_uq").on(t.userId, t.productId).where(sql`status IN ('PENDING_PAYMENT','PAID')`),
    check("orders_amount_positive", sql`${t.amountMinor} > 0`),
  ],
);

/**
 * One try at paying an order through Paystack. Paystack insists on a fresh reference for every transaction, so each
 * click on "Pay" gets its own reference (the order's TMP- code plus a random tail). Whichever attempt is paid settles the order.
 */
export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: id(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
    provider: text("provider").notNull().default("paystack"),
    reference: text("reference").notNull(),
    /** STARTED, PAID, or MISMATCH (Paystack reported a payment whose amount or currency did not match the order). */
    status: text("status").notNull().default("STARTED"),
    /** Channel Paystack reported (mobile_money, card...), kept for reconciliation. */
    channel: text("channel"),
    completedAt: ts("completed_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payment_attempts_reference_uq").on(t.reference), index("payment_attempts_order_idx").on(t.orderId, t.createdAt)],
);

/** Every review decision and takedown on a resource, with the rubric scores. Append-only by convention. */
export const resourceReviews = pgTable(
  "resource_reviews",
  {
    id: id(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    /** Which submission this decision belongs to. */
    submission: integer("submission").notNull().default(0),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    decision: text("decision").notNull(),
    rubricVersion: integer("rubric_version").notNull().default(1),
    scores: jsonb("scores").$type<Record<string, number>>(),
    /** Written feedback shown to the creator. */
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("resource_reviews_product_idx").on(t.productId, t.createdAt)],
);

/** A person who sells resources. Created when they accept the Creator Terms. */
export const creatorProfiles = pgTable("creator_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "restrict" }),
  displayName: text("display_name").notNull(),
  bio: text("bio").notNull().default(""),
  /** PRIVATE: where payouts are sent (MoMo). Never shown publicly. */
  payoutPhone: text("payout_phone"),
  termsVersion: integer("terms_version").notNull(),
  termsAcceptedAt: ts("terms_accepted_at").notNull(),
  isSuspended: boolean("is_suspended").notNull().default(false),
  createdAt: createdAt(),
});

/** Money TMP has paid out to a creator. Balance = creator share of paid orders minus payouts. */
export const creatorPayouts = pgTable(
  "creator_payouts",
  {
    id: id(),
    creatorId: uuid("creator_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    /** MoMo transaction id of the payout. */
    reference: text("reference").notNull(),
    paidById: uuid("paid_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("creator_payouts_creator_idx").on(t.creatorId, t.createdAt), check("creator_payouts_positive", sql`${t.amountMinor} > 0`)],
);
