import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, ts, users } from "./identity";

export const tutorStatus = pgEnum("tutor_status", ["PENDING", "CHANGES_REQUESTED", "APPROVED", "REJECTED"]);

/**
 * A tutor's application and public profile in one row.
 *
 * PRIVATE columns (never sent to the public website or to Kaitlyn): full_name, email, phone, qualifications,
 * experience, availability, admin_notes, review fields. PUBLIC columns: display_name .. sort_order. The
 * public queries in server/tutors/service.ts select the public columns explicitly; there is no SELECT *.
 * A profile is visible on the website only when status = APPROVED and is_published = true.
 */
export const tutorProfiles = pgTable(
  "tutor_profiles",
  {
    id: id(),
    status: tutorStatus("status").notNull().default("PENDING"),
    isPublished: boolean("is_published").notNull().default(false),
    /** "application" (public form) or "admin" (added by staff). */
    source: text("source").notNull().default("application"),

    // Private
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    qualifications: text("qualifications").notNull().default(""),
    experience: text("experience").notNull().default(""),
    availability: text("availability").notNull().default(""),
    adminNotes: text("admin_notes"),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),

    // Public
    displayName: text("display_name"),
    headline: text("headline"),
    bio: text("bio"),
    subjects: text("subjects").array().notNull().default(sql`'{}'::text[]`),
    levelKeys: text("level_keys").array().notNull().default(sql`'{}'::text[]`),
    curriculumKeys: text("curriculum_keys").array().notNull().default(sql`'{}'::text[]`),
    modes: text("modes").array().notNull().default(sql`'{}'::text[]`),
    areas: text("areas"),
    /** A picture from the media library (/media/<id>.jpg). Set by staff only, with the tutor's consent. */
    photoPath: text("photo_path"),
    yearsExperience: integer("years_experience"),
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: createdAt(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("tutor_profiles_status_idx").on(t.status, t.createdAt),
    index("tutor_profiles_public_idx").on(t.status, t.isPublished, t.sortOrder),
    /** One live application per person; a rejected one does not block a later, better application. */
    uniqueIndex("tutor_profiles_email_live_uq").on(t.email).where(sql`status <> 'REJECTED'`),
    check("tutor_profiles_email_lower", sql`${t.email} = lower(${t.email})`),
    check("tutor_profiles_published_needs_approval", sql`NOT ${t.isPublished} OR ${t.status} = 'APPROVED'`),
  ],
);
