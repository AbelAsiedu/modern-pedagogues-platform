import type { DbOrTx } from "../db";
import { INDICATIVE_TUTORING_RATE } from "../../lib/site";
import { academicLevels, curricula, roles, siteSettings } from "../db/schema";
import { ROLE_KEYS, ROLE_LABELS, STAFF_ROLES } from "../permissions/catalog";

/**
 * Idempotent reference data. Safe to run on every deploy: it inserts what is missing and refreshes
 * names/descriptions, but never deletes rows or touches user-created data.
 */

export const CURRICULA = [
  { key: "ges", name: "Ghana Education Service (GES)", sortOrder: 1 },
  { key: "cambridge_british", name: "Cambridge / British", sortOrder: 2 },
  { key: "pearson_edexcel", name: "Pearson Edexcel", sortOrder: 3 },
  { key: "ib", name: "International Baccalaureate (IB)", sortOrder: 4 },
  { key: "canadian", name: "Canadian", sortOrder: 5 },
] as const;

export const LEVELS = [
  { key: "preschool", name: "Pre-school", stage: "preschool", sortOrder: 1 },
  { key: "primary", name: "Primary", stage: "primary", sortOrder: 2 },
  { key: "jhs", name: "Junior High School (JHS)", stage: "junior_high", sortOrder: 3 },
  { key: "shs", name: "Senior High School (SHS)", stage: "senior_high", sortOrder: 4 },
  { key: "adult", name: "Adult learners", stage: "adult", sortOrder: 5 },
  { key: "exam_prep", name: "Exam preparation (BECE / WASSCE)", stage: "exam_prep", sortOrder: 6 },
] as const;

/**
 * Owner decision (2026-11-04): tutoring rates are negotiable per learner and can start from GHS 100
 * per session. This is an indicative "from" price shown on the website, not a fixed tariff.
 */
export const DEFAULT_SETTINGS = {
  "tutoring.indicative_rate": {
    amountMinor: INDICATIVE_TUTORING_RATE.amount.toString(),
    currency: INDICATIVE_TUTORING_RATE.currency,
    unit: "session",
    negotiable: true,
  },
  /**
   * Owner decision (2026-11-04): use the average marketplace commission. Surveyed platforms range from
   * 10% (Gumroad direct) to 30% (Gumroad Discover) to 63% (Udemy organic); 30% is used, i.e. creators keep 70%.
   * Admin-editable, and applied only when marketplace sales exist (Phase 8). The payment-provider fee is
   * paid out of TMP's share ("platform") rather than deducted from creators.
   */
  "marketplace.commission": { commissionBps: 3000, processingFeeBearer: "platform" },
} as const;

export async function seedReferenceData(db: DbOrTx): Promise<void> {
  for (const key of ROLE_KEYS) {
    const label = ROLE_LABELS[key];
    await db
      .insert(roles)
      .values({ key, name: label.name, description: label.description, isStaff: STAFF_ROLES.includes(key) })
      .onConflictDoUpdate({
        target: roles.key,
        set: { name: label.name, description: label.description, isStaff: STAFF_ROLES.includes(key) },
      });
  }
  for (const c of CURRICULA) {
    await db
      .insert(curricula)
      .values(c)
      .onConflictDoUpdate({ target: curricula.key, set: { name: c.name, sortOrder: c.sortOrder } });
  }
  for (const l of LEVELS) {
    await db
      .insert(academicLevels)
      .values(l)
      .onConflictDoUpdate({ target: academicLevels.key, set: { name: l.name, stage: l.stage, sortOrder: l.sortOrder } });
  }
  // Settings are admin-editable, so seeding only fills in missing keys and never overwrites a change.
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db
      .insert(siteSettings)
      .values({ key, value })
      .onConflictDoNothing({ target: siteSettings.key });
  }
}
