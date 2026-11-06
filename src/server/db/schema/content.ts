import { boolean, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, ts, users } from "./identity";

/** Home-page hero slides. Managed by staff with the `content.manage_site` permission. */
export const heroBanners = pgTable(
  "hero_banners",
  {
    id: id(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    /** A path served by this site (for example /images/slide-1.svg). External URLs are not allowed. */
    imagePath: text("image_path").notNull(),
    imageAlt: text("image_alt").notNull().default(""),
    buttonText: text("button_text"),
    /** Relative path, https:// URL, mailto: or tel:. Validated on write. */
    buttonUrl: text("button_url"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("hero_banners_active_order_idx").on(t.isActive, t.sortOrder)],
);

/**
 * Admin-edited site text. A row exists only while an editor has changed the text from its default
 * (see server/content/registry.ts); deleting the row restores the default.
 */
export const siteContent = pgTable("site_content", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
