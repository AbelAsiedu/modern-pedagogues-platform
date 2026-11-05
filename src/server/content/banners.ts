import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "../audit";
import type { DbOrTx } from "../db";
import { heroBanners } from "../db/schema";
import { NotFoundError } from "../errors";
import { assertCan, type Actor } from "../permissions/authorize";
import { parseOrThrow } from "../auth/validation";

/** Slides shown when the database has no active banners (or cannot be reached). */
export const DEFAULT_BANNERS = [
  {
    id: "default-1",
    title: "Education keeps changing. So do we.",
    subtitle:
      "Personalised tutoring from Pre-school to Senior High School, across Ghanaian, British, Pearson Edexcel, IB and Canadian curricula.",
    imagePath: "/images/slide-learning.svg",
    imageAlt: "Illustration of a learner and tutor",
    buttonText: "Request a tutor",
    buttonUrl: "/contact",
  },
  {
    id: "default-2",
    title: "Final Lap exam preparation",
    subtitle: "Intensive revision and mock examinations ahead of BECE and major assessments, tracked mock by mock.",
    imagePath: "/images/slide-exams.svg",
    imageAlt: "Illustration of exam preparation",
    buttonText: "See our services",
    buttonUrl: "/services",
  },
  {
    id: "default-3",
    title: "A team behind every ward",
    subtitle: "Qualified tutors, honest reporting every term, and a direct line to TMP.",
    imagePath: "/images/slide-team.svg",
    imageAlt: "Illustration of a tutoring team",
    buttonText: "About TMP",
    buttonUrl: "/about",
  },
] as const;

export type PublicBanner = {
  id: string;
  title: string;
  subtitle: string | null;
  imagePath: string;
  imageAlt: string;
  buttonText: string | null;
  buttonUrl: string | null;
};

/** Only same-site image paths: the CSP blocks external images, and this prevents tracking pixels. */
const imagePath = z
  .string()
  .trim()
  .regex(/^\/(?!\/)[A-Za-z0-9/_.-]{1,200}\.(svg|png|jpe?g|webp|avif)$/, "Use an image path on this site, for example /images/slide-1.svg.")
  .refine((p) => !p.includes(".."), "Invalid path.");

/** Same-site path, https URL, mailto: or tel:. Never javascript: or data:. */
export const safeLink = z
  .string()
  .trim()
  .max(500)
  .refine((u) => /^(\/(?!\/)[^\s]*|https:\/\/[^\s]+|mailto:[^\s]+|tel:[+0-9]+)$/.test(u), "Use a page path (/contact), an https:// link, mailto: or tel:.");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const bannerInput = z.object({
  title: z.string().trim().min(2, "Enter a title.").max(120),
  subtitle: optionalText(300),
  imagePath,
  imageAlt: z.string().trim().max(200).default(""),
  buttonText: optionalText(40),
  buttonUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(safeLink.nullable()),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});
export type BannerInput = z.input<typeof bannerInput>;

export async function getPublicBanners(db: DbOrTx): Promise<PublicBanner[]> {
  const rows = await db
    .select()
    .from(heroBanners)
    .where(eq(heroBanners.isActive, true))
    .orderBy(asc(heroBanners.sortOrder), asc(heroBanners.createdAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    imagePath: r.imagePath,
    imageAlt: r.imageAlt,
    buttonText: r.buttonText,
    buttonUrl: r.buttonUrl,
  }));
}

/** Never throws: the home page must render even if the database is down or empty. */
export async function getPublicBannersOrDefaults(db: DbOrTx | (() => DbOrTx)): Promise<PublicBanner[]> {
  try {
    const rows = await getPublicBanners(typeof db === "function" ? db() : db);
    if (rows.length > 0) return rows;
  } catch {
    /* fall through to defaults */
  }
  return DEFAULT_BANNERS.map((b) => ({ ...b }));
}

export async function listAllBanners(db: DbOrTx, actor: Actor | null) {
  assertCan(actor, "content.manage_site");
  return db.select().from(heroBanners).orderBy(asc(heroBanners.sortOrder), asc(heroBanners.createdAt));
}

export async function createBanner(db: DbOrTx, actor: Actor | null, input: BannerInput, ip?: string | null) {
  assertCan(actor, "content.manage_site");
  const data = parseOrThrow(bannerInput, input);
  const [row] = await db.insert(heroBanners).values({ ...data, createdById: actor.id }).returning({ id: heroBanners.id });
  await recordAudit(db, { actorId: actor.id, action: "banner.created", entityType: "hero_banner", entityId: row!.id, metadata: { title: data.title }, ip });
  return row!.id;
}

export async function updateBanner(db: DbOrTx, actor: Actor | null, bannerId: string, input: BannerInput, ip?: string | null) {
  assertCan(actor, "content.manage_site");
  const data = parseOrThrow(bannerInput, input);
  const [row] = await db.update(heroBanners).set(data).where(eq(heroBanners.id, bannerId)).returning({ id: heroBanners.id });
  if (!row) throw new NotFoundError("banner not found");
  await recordAudit(db, { actorId: actor.id, action: "banner.updated", entityType: "hero_banner", entityId: bannerId, metadata: { title: data.title }, ip });
}

export async function setBannerActive(db: DbOrTx, actor: Actor | null, bannerId: string, isActive: boolean, ip?: string | null) {
  assertCan(actor, "content.manage_site");
  const [row] = await db.update(heroBanners).set({ isActive }).where(eq(heroBanners.id, bannerId)).returning({ id: heroBanners.id });
  if (!row) throw new NotFoundError("banner not found");
  await recordAudit(db, { actorId: actor.id, action: isActive ? "banner.activated" : "banner.deactivated", entityType: "hero_banner", entityId: bannerId, ip });
}

export async function deleteBanner(db: DbOrTx, actor: Actor | null, bannerId: string, ip?: string | null) {
  assertCan(actor, "content.manage_site");
  const [row] = await db.delete(heroBanners).where(and(eq(heroBanners.id, bannerId))).returning({ id: heroBanners.id, title: heroBanners.title });
  if (!row) throw new NotFoundError("banner not found");
  await recordAudit(db, { actorId: actor.id, action: "banner.deleted", entityType: "hero_banner", entityId: bannerId, metadata: { title: row.title }, ip });
}

export async function getBannerCount(db: DbOrTx): Promise<{ total: number; active: number }> {
  try {
    const rows = await db.select({ isActive: heroBanners.isActive }).from(heroBanners);
    return { total: rows.length, active: rows.filter((r) => r.isActive).length };
  } catch {
    return { total: 0, active: 0 };
  }
}
