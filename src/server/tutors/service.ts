import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { loadSiteText } from "../content/site-content";
import { recordAudit } from "../audit";
import { enforceRateLimit } from "../auth/rate-limit";
import { emailSchema, parseOrThrow } from "../auth/validation";
import type { Db, DbOrTx } from "../db";
import { academicLevels, curricula, tutorProfiles } from "../db/schema";
import { deliverEmail, type DeliverDeps } from "../email/deliver";
import {
  tutorApplicationAlertMessage,
  tutorApplicationReceivedMessage,
  tutorDecisionMessage,
  type TutorDecisionKind,
} from "../email/templates";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { assertCan, type Actor } from "../permissions/authorize";

export const TEACHING_MODES = ["home", "online"] as const;
export const MODE_LABELS: Record<(typeof TEACHING_MODES)[number], string> = { home: "At home", online: "Online" };

// ---------- validation ----------

/**
 * Public fields are shown to every visitor and read by Kaitlyn, so they must not carry contact details.
 * This blocks emails, links and long digit runs (phone numbers). It is a safety net, not a substitute for review.
 */
export function containsContactDetails(text: string): boolean {
  return /[^\s@]+@[^\s@]+/.test(text) || /https?:\/\/|www\./i.test(text) || /(\d[\s().-]*){7,}/.test(text);
}
const publicText = (label: string, max: number, min = 0) =>
  z
    .string()
    .trim()
    .min(min, `${label} is too short.`)
    .max(max, `${label} is too long (maximum ${max} characters).`)
    .refine((v) => !containsContactDetails(v), `${label} must not contain email addresses, links or phone numbers.`);

const stringList = (label: string, maxItems: number, maxLen = 40) =>
  z
    .array(z.string().trim().min(1).max(maxLen))
    .max(maxItems, `Choose at most ${maxItems} ${label}.`)
    .transform((a) => [...new Set(a)]);

/** "Maths, English" -> ["Maths","English"]. Accepts a comma/newline separated string or an array. */
const csv = (v: unknown) =>
  Array.isArray(v)
    ? v
    : typeof v === "string"
      ? v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)
      : [];

const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number.");

const publicProfileFields = {
  displayName: publicText("Public name", 60, 2),
  headline: publicText("Headline", 120, 5),
  bio: publicText("Biography", 1200, 20),
  subjects: z.preprocess(csv, stringList("subjects", 12).pipe(z.array(z.string()).min(1, "Add at least one subject."))),
  levelKeys: z.preprocess((v) => (Array.isArray(v) ? v : []), stringList("levels", 10, 40).pipe(z.array(z.string()).min(1, "Choose at least one level."))),
  curriculumKeys: z.preprocess((v) => (Array.isArray(v) ? v : []), stringList("curricula", 10, 40)),
  modes: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.enum(TEACHING_MODES)).min(1, "Choose home, online or both.")),
  areas: publicText("Areas", 200).optional().transform((v) => v || null),
  yearsExperience: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(0).max(60).optional()).transform((v) => v ?? null),
};

export const applicationInput = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  email: emailSchema,
  phone,
  qualifications: z.string().trim().min(10, "Tell us about your qualifications.").max(2000),
  experience: z.string().trim().min(10, "Tell us about your teaching experience.").max(2000),
  availability: z.string().trim().max(500).default(""),
  bio: publicText("Introduction", 1200, 20),
  subjects: publicProfileFields.subjects,
  levelKeys: publicProfileFields.levelKeys,
  curriculumKeys: publicProfileFields.curriculumKeys,
  modes: publicProfileFields.modes,
  areas: publicProfileFields.areas,
  yearsExperience: publicProfileFields.yearsExperience,
  consent: z.literal(true, "Please confirm you agree to the privacy policy."),
});
export type ApplicationInput = z.input<typeof applicationInput>;

/** Empty, or a picture from this site's media library. */
const photoPathInput = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null)
  .pipe(z.string().regex(/^\/media\/[0-9a-f-]{36}\.(jpg|png|webp)$/, "Choose a picture from the list.").nullable());

export const profileEditInput = z.object({
  ...publicProfileFields,
  photoPath: photoPathInput,
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  adminNotes: z.string().trim().max(4000).optional().transform((v) => v || null),
});
export type ProfileEditInput = z.input<typeof profileEditInput>;

export const adminCreateInput = z.object({ fullName: z.string().trim().min(2).max(120), email: emailSchema, phone: phone.optional().or(z.literal("").transform(() => undefined)) });

/** First name and last initial: "Ama Serwaa Mensah" -> "Ama M." */
export function defaultDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "Tutor";
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

async function assertKnownKeys(db: DbOrTx, levelKeys: string[], curriculumKeys: string[]) {
  const [lv, cu] = await Promise.all([
    db.select({ key: academicLevels.key }).from(academicLevels).where(eq(academicLevels.isActive, true)),
    db.select({ key: curricula.key }).from(curricula).where(eq(curricula.isActive, true)),
  ]);
  const badLevel = levelKeys.find((k) => !lv.some((x) => x.key === k));
  const badCur = curriculumKeys.find((k) => !cu.some((x) => x.key === k));
  if (badLevel) throw new ValidationError({ levelKeys: ["Choose from the listed levels."] });
  if (badCur) throw new ValidationError({ curriculumKeys: ["Choose from the listed curricula."] });
}

// ---------- applications (public) ----------

export type ApplyDeps = DeliverDeps & { appUrl: string; notifyEmail?: string };

/**
 * Submit a tutor application. Rate-limited per IP and per email. A repeat application from an email that
 * already has a live one is accepted silently (no duplicate row, same response) so the form does not reveal
 * who has applied.
 */
export async function submitApplication(deps: ApplyDeps, input: unknown, ctx: { ip?: string | null } = {}) {
  const { db } = deps;
  await enforceRateLimit(db, { key: `tutor-apply:ip:${ctx.ip ?? "unknown"}`, limit: 5, windowSeconds: 3600 });
  const data = parseOrThrow(applicationInput, input);
  await enforceRateLimit(db, { key: `tutor-apply:email:${data.email}`, limit: 3, windowSeconds: 86_400 });
  await assertKnownKeys(db, data.levelKeys, data.curriculumKeys);

  const inserted = await db
    .insert(tutorProfiles)
    .values({
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      qualifications: data.qualifications,
      experience: data.experience,
      availability: data.availability,
      displayName: defaultDisplayName(data.fullName),
      bio: data.bio,
      subjects: data.subjects,
      levelKeys: data.levelKeys,
      curriculumKeys: data.curriculumKeys,
      modes: data.modes,
      areas: data.areas,
      yearsExperience: data.yearsExperience,
    })
    .onConflictDoNothing()
    .returning({ id: tutorProfiles.id });
  const row = inserted[0];
  if (!row) return; // a live application for this email already exists

  await recordAudit(db, { action: "tutor.application_submitted", entityType: "tutor_profile", entityId: row.id, ip: ctx.ip });
  await deliverEmail(deps, tutorApplicationReceivedMessage(data.email, data.fullName));
  await deliverEmail(
    deps,
    tutorApplicationAlertMessage(deps.notifyEmail ?? (await loadSiteText(deps.db)).biz.email, data.fullName, `${deps.appUrl.replace(/\/$/, "")}/admin/tutors/${row.id}`),
  );
}

// ---------- public directory ----------

export type PublicTutor = {
  id: string;
  displayName: string;
  headline: string;
  bio: string;
  subjects: string[];
  levels: string[];
  curricula: string[];
  modes: string[];
  areas: string | null;
  yearsExperience: number | null;
  photoPath: string | null;
};

export type TutorFilter = { level?: string; curriculum?: string; subject?: string; mode?: string };

/** Explicit column list on purpose: private columns must never be selectable from the public path. */
const publicColumns = {
  id: tutorProfiles.id,
  displayName: tutorProfiles.displayName,
  headline: tutorProfiles.headline,
  bio: tutorProfiles.bio,
  subjects: tutorProfiles.subjects,
  levelKeys: tutorProfiles.levelKeys,
  curriculumKeys: tutorProfiles.curriculumKeys,
  modes: tutorProfiles.modes,
  areas: tutorProfiles.areas,
  yearsExperience: tutorProfiles.yearsExperience,
  photoPath: tutorProfiles.photoPath,
};

const visible = and(eq(tutorProfiles.status, "APPROVED"), eq(tutorProfiles.isPublished, true));

async function nameMaps(db: DbOrTx) {
  const [lv, cu] = await Promise.all([
    db.select({ key: academicLevels.key, name: academicLevels.name }).from(academicLevels),
    db.select({ key: curricula.key, name: curricula.name }).from(curricula),
  ]);
  return { level: new Map(lv.map((x) => [x.key, x.name])), curriculum: new Map(cu.map((x) => [x.key, x.name])) };
}

type PublicRow = { id: string; displayName: string | null; headline: string | null; bio: string | null; subjects: string[]; levelKeys: string[]; curriculumKeys: string[]; modes: string[]; areas: string | null; yearsExperience: number | null; photoPath: string | null };

function toPublic(r: PublicRow, names: Awaited<ReturnType<typeof nameMaps>>): PublicTutor {
  return {
    id: r.id,
    displayName: r.displayName ?? "TMP tutor",
    headline: r.headline ?? "",
    bio: r.bio ?? "",
    subjects: r.subjects,
    levels: r.levelKeys.map((k) => names.level.get(k) ?? k),
    curricula: r.curriculumKeys.map((k) => names.curriculum.get(k) ?? k),
    modes: r.modes.map((m) => MODE_LABELS[m as keyof typeof MODE_LABELS] ?? m),
    areas: r.areas,
    yearsExperience: r.yearsExperience,
    photoPath: r.photoPath,
  };
}

export async function listPublicTutors(db: DbOrTx, filter: TutorFilter = {}): Promise<PublicTutor[]> {
  const [rows, names] = await Promise.all([
    db.select(publicColumns).from(tutorProfiles).where(visible).orderBy(asc(tutorProfiles.sortOrder), asc(tutorProfiles.displayName)),
    nameMaps(db),
  ]);
  const subject = filter.subject?.trim().toLowerCase();
  return rows
    .filter((r) => !filter.level || r.levelKeys.includes(filter.level))
    .filter((r) => !filter.curriculum || r.curriculumKeys.includes(filter.curriculum))
    .filter((r) => !filter.mode || r.modes.includes(filter.mode))
    .filter((r) => !subject || r.subjects.some((s) => s.toLowerCase().includes(subject)))
    .map((r) => toPublic(r, names));
}

export async function getPublicTutor(db: DbOrTx, id: string): Promise<PublicTutor | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [rows, names] = await Promise.all([db.select(publicColumns).from(tutorProfiles).where(and(visible, eq(tutorProfiles.id, id))).limit(1), nameMaps(db)]);
  return rows[0] ? toPublic(rows[0], names) : null;
}

/** Filter choices for the Tutors page: only levels/curricula that a visible tutor actually offers. */
export async function tutorFilterOptions(db: DbOrTx) {
  const [lv, cu] = await Promise.all([
    db.select({ key: academicLevels.key, name: academicLevels.name }).from(academicLevels).where(eq(academicLevels.isActive, true)).orderBy(asc(academicLevels.sortOrder)),
    db.select({ key: curricula.key, name: curricula.name }).from(curricula).where(eq(curricula.isActive, true)).orderBy(asc(curricula.sortOrder)),
  ]);
  return { levels: lv, curricula: cu };
}

// ---------- admin ----------

export type TutorStatus = "PENDING" | "CHANGES_REQUESTED" | "APPROVED" | "REJECTED";
export const TUTOR_STATUSES: readonly TutorStatus[] = ["PENDING", "CHANGES_REQUESTED", "APPROVED", "REJECTED"];

export async function listTutorProfiles(db: DbOrTx, actor: Actor | null, status?: TutorStatus) {
  assertCan(actor, "tutors.review_applications");
  return db
    .select()
    .from(tutorProfiles)
    .where(status ? eq(tutorProfiles.status, status) : undefined)
    .orderBy(desc(tutorProfiles.createdAt))
    .limit(500);
}

export async function tutorStatusCounts(db: DbOrTx, actor: Actor | null): Promise<Record<TutorStatus, number>> {
  assertCan(actor, "tutors.review_applications");
  const rows = await db
    .select({ status: tutorProfiles.status, n: sql<number>`count(*)::int` })
    .from(tutorProfiles)
    .groupBy(tutorProfiles.status);
  const out: Record<TutorStatus, number> = { PENDING: 0, CHANGES_REQUESTED: 0, APPROVED: 0, REJECTED: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export async function getTutorProfile(db: DbOrTx, actor: Actor | null, id: string) {
  assertCan(actor, "tutors.review_applications");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError("tutor not found");
  const [row] = await db.select().from(tutorProfiles).where(eq(tutorProfiles.id, id));
  if (!row) throw new NotFoundError("tutor not found");
  return row;
}

/** Staff-entered tutor (for example someone recruited offline). Starts as PENDING; complete the profile, then approve. */
export async function createTutorByAdmin(db: DbOrTx, actor: Actor | null, input: unknown, ip?: string | null) {
  assertCan(actor, "tutors.approve");
  const data = parseOrThrow(adminCreateInput, input);
  const [row] = await db
    .insert(tutorProfiles)
    .values({ fullName: data.fullName, email: data.email, phone: data.phone ?? null, source: "admin", displayName: defaultDisplayName(data.fullName) })
    .onConflictDoNothing()
    .returning({ id: tutorProfiles.id });
  if (!row) throw new ConflictError("A tutor with that email already exists.");
  await recordAudit(db, { actorId: actor.id, action: "tutor.created", entityType: "tutor_profile", entityId: row.id, ip });
  return row.id;
}

/** Edit the public profile and internal notes. Allowed in any status, so approved profiles can be corrected. */
export async function updateTutorProfile(db: DbOrTx, actor: Actor | null, id: string, input: unknown, ip?: string | null) {
  assertCan(actor, "tutors.review_applications");
  const data = parseOrThrow(profileEditInput, input);
  await assertKnownKeys(db, data.levelKeys, data.curriculumKeys);
  const [row] = await db.update(tutorProfiles).set(data).where(eq(tutorProfiles.id, id)).returning({ id: tutorProfiles.id });
  if (!row) throw new NotFoundError("tutor not found");
  await recordAudit(db, { actorId: actor.id, action: "tutor.profile_updated", entityType: "tutor_profile", entityId: id, ip });
}

export const privateDetailsInput = z.object({
  fullName: z.string().trim().min(2, "Enter the full name.").max(120),
  email: emailSchema,
  phone: phone.optional().or(z.literal("").transform(() => undefined)),
  qualifications: z.string().trim().max(2000).default(""),
  experience: z.string().trim().max(2000).default(""),
  availability: z.string().trim().max(500).default(""),
});

/**
 * Correct the private details (a mistyped email or phone, updated qualifications). Does not touch the public
 * profile or the status. Changing the email is refused if another live tutor already uses it.
 */
export async function updateTutorPrivateDetails(db: DbOrTx, actor: Actor | null, id: string, input: unknown, ip?: string | null) {
  assertCan(actor, "tutors.review_applications");
  const data = parseOrThrow(privateDetailsInput, input);
  try {
    const [row] = await db
      .update(tutorProfiles)
      .set({ ...data, phone: data.phone ?? null })
      .where(eq(tutorProfiles.id, id))
      .returning({ id: tutorProfiles.id });
    if (!row) throw new NotFoundError("tutor not found");
  } catch (err) {
    const code = (err as { code?: string; cause?: { code?: string } }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") throw new ConflictError("Another tutor already uses that email address.");
    throw err;
  }
  // Which fields changed is useful; their values are personal data and stay out of the audit log.
  await recordAudit(db, { actorId: actor.id, action: "tutor.details_updated", entityType: "tutor_profile", entityId: id, ip });
}

/** Permanent removal, for example to honour a deletion request. The audit entry records the id only, no personal data. */
export async function deleteTutor(db: DbOrTx, actor: Actor | null, id: string, ip?: string | null) {
  assertCan(actor, "tutors.approve");
  const [row] = await db.delete(tutorProfiles).where(eq(tutorProfiles.id, id)).returning({ id: tutorProfiles.id });
  if (!row) throw new NotFoundError("tutor not found");
  await recordAudit(db, { actorId: actor.id, action: "tutor.deleted", entityType: "tutor_profile", entityId: id, ip });
}

const decisionInput = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]),
  message: z.string().trim().max(1500).optional().transform((v) => v || null),
});

/**
 * Approve, reject, or ask for changes. Approving publishes the profile, and requires a complete public
 * profile (name, headline, biography, subjects, levels, teaching modes). The applicant is emailed.
 */
export async function decideTutor(deps: DeliverDeps, actor: Actor | null, id: string, input: unknown, ip?: string | null) {
  assertCan(actor, "tutors.approve");
  const { db } = deps;
  const { decision, message } = parseOrThrow(decisionInput, input);
  if (decision === "CHANGES_REQUESTED" && !message) throw new ValidationError({ message: ["Say what needs to change."] });

  const profile = await getTutorProfile(db, actor, id);
  if (profile.status === decision) throw new ConflictError(`Already ${decision.toLowerCase().replace("_", " ")}.`);
  if (decision === "APPROVED") {
    const check = z.object(publicProfileFields).safeParse({
      ...profile,
      displayName: profile.displayName ?? "",
      headline: profile.headline ?? "",
      bio: profile.bio ?? "",
      areas: profile.areas ?? undefined,
      yearsExperience: profile.yearsExperience ?? undefined,
    });
    if (!check.success) {
      const first = check.error.issues[0];
      // Shown beside the decision form's message box, which is the only field on that form.
      throw new ValidationError({ message: [`Complete the public profile first. ${first?.message ?? ""}`.trim()] });
    }
    await assertKnownKeys(db, profile.levelKeys, profile.curriculumKeys);
  }

  const [row] = await db
    .update(tutorProfiles)
    .set({ status: decision, isPublished: decision === "APPROVED", reviewedById: actor.id, reviewedAt: new Date() })
    .where(and(eq(tutorProfiles.id, id), eq(tutorProfiles.status, profile.status))) // lost-update guard
    .returning({ id: tutorProfiles.id });
  if (!row) throw new ConflictError("Someone else just changed this profile. Reload and try again.");
  await recordAudit(db, { actorId: actor.id, action: `tutor.${decision.toLowerCase()}`, entityType: "tutor_profile", entityId: id, metadata: { from: profile.status }, ip });
  await deliverEmail(deps, tutorDecisionMessage(profile.email, profile.fullName, decision as TutorDecisionKind, message));
}

/** Show or hide an approved profile without changing its status. */
export async function setTutorPublished(db: DbOrTx, actor: Actor | null, id: string, published: boolean, ip?: string | null) {
  assertCan(actor, "tutors.approve");
  const [row] = await db
    .update(tutorProfiles)
    .set({ isPublished: published })
    .where(and(eq(tutorProfiles.id, id), eq(tutorProfiles.status, "APPROVED")))
    .returning({ id: tutorProfiles.id });
  if (!row) throw new ConflictError("Only approved profiles can be shown or hidden.");
  await recordAudit(db, { actorId: actor.id, action: published ? "tutor.published" : "tutor.unpublished", entityType: "tutor_profile", entityId: id, ip });
}

export type { Db };
