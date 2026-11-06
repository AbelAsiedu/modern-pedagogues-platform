import { asc, eq } from "drizzle-orm";
import type { DbOrTx } from "../db";
import { academicLevels, curricula } from "../db/schema";
import { ValidationError } from "../errors";

/** Levels and curricula a resource can be filed under (the same lists tutors use, editable by staff in the database). */
export async function resourceTaxonomy(db: DbOrTx) {
  const [levels, cur] = await Promise.all([
    db.select({ key: academicLevels.key, name: academicLevels.name }).from(academicLevels).where(eq(academicLevels.isActive, true)).orderBy(asc(academicLevels.sortOrder)),
    db.select({ key: curricula.key, name: curricula.name }).from(curricula).where(eq(curricula.isActive, true)).orderBy(asc(curricula.sortOrder)),
  ]);
  return { levels, curricula: cur };
}

export async function assertKnownTaxonomy(db: DbOrTx, levelKeys: readonly string[], curriculumKeys: readonly string[]) {
  const t = await resourceTaxonomy(db);
  if (levelKeys.some((k) => !t.levels.some((l) => l.key === k))) throw new ValidationError({ levelKeys: ["Choose from the listed levels."] }, "unknown level");
  if (curriculumKeys.some((k) => !t.curricula.some((c) => c.key === k))) throw new ValidationError({ curriculumKeys: ["Choose from the listed curricula."] }, "unknown curriculum");
}
