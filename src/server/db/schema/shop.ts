import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, ts, users } from "./identity";
import { bytea } from "./media";

export const orderStatus = pgEnum("order_status", ["PENDING_PAYMENT", "PAID", "CANCELLED"]);

/** A downloadable resource (a PDF). PRIVATE: only ever served to a buyer whose order is paid, or to staff. */
export const productFiles = pgTable("product_files", {
  id: id(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256").notNull(),
  data: bytea("data").notNull(),
  uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/** A digital resource TMP sells (worksheets, past questions, notes). */
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
    fileId: uuid("file_id").references(() => productFiles.id, { onDelete: "restrict" }),
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
    index("products_public_idx").on(t.isPublished, t.sortOrder),
    check("products_price_positive", sql`${t.priceMinor} > 0`),
    check("products_published_needs_file", sql`NOT ${t.isPublished} OR ${t.fileId} IS NOT NULL`),
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
    paidAt: ts("paid_at"),
    paidById: uuid("paid_by_id").references(() => users.id, { onDelete: "set null" }),
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
