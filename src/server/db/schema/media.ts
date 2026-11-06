import { customType, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, users } from "./identity";

/** Raw bytes. Heroku's disk is wiped on every restart, so uploads live in Postgres rather than on the filesystem. */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * Images uploaded by staff (banners, tutor photos, shop covers). Always re-encoded on upload, so the stored bytes
 * are a clean JPEG, PNG or WebP with no metadata. Public by design: they are only ever shown on public pages.
 */
export const mediaFiles = pgTable(
  "media_files",
  {
    id: id(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sha256: text("sha256").notNull(),
    altText: text("alt_text").notNull().default(""),
    data: bytea("data").notNull(),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("media_files_created_idx").on(t.createdAt)],
);
