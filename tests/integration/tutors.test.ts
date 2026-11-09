import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { listAuditLogs } from "@/server/admin/audit";
import { tutorProfiles } from "@/server/db/schema";
import { MemoryMailer } from "@/server/email/mailer";
import { createLogger } from "@/server/logger";
import { ConflictError, ForbiddenError, NotFoundError, RateLimitError, ValidationError } from "@/server/errors";
import {
  createTutorByAdmin,
  decideTutor,
  getPublicTutor,
  getTutorProfile,
  listPublicTutors,
  listTutorProfiles,
  setTutorPublished,
  submitApplication,
  updateTutorProfile,
  updateTutorPrivateDetails,
  deleteTutor,
  type ApplyDeps,
} from "@/server/tutors/service";
import { makeActor, openTestDb, resetData } from "../support/harness";

const { pool, db } = openTestDb();
afterAll(() => pool.end());
beforeEach(() => resetData(db));

function deps(): ApplyDeps & { mailer: MemoryMailer } {
  const mailer = new MemoryMailer();
  return { db, mailer, log: createLogger("silent"), appUrl: "https://tmp.example", notifyEmail: "inbox@tmp.example" };
}

const application = {
  fullName: "Ama Serwaa Mensah",
  email: "Ama.Tutor@Example.com",
  phone: "+233 24 000 1111",
  qualifications: "BEd Mathematics, University of Cape Coast",
  experience: "Six years teaching JHS and SHS mathematics",
  availability: "Weekday evenings",
  bio: "I help learners build confidence in mathematics with patient, step-by-step teaching.",
  subjects: "Mathematics, Integrated Science, Mathematics",
  levelKeys: ["jhs", "shs"],
  curriculumKeys: ["ges"],
  modes: ["home", "online"],
  areas: "East Legon, Madina",
  yearsExperience: "6",
  consent: true,
};

const completeProfile = {
  displayName: "Ama M.",
  headline: "Mathematics and Science specialist for JHS and SHS",
  bio: "I help learners build confidence in mathematics with patient, step-by-step teaching.",
  subjects: "Mathematics, Integrated Science",
  levelKeys: ["jhs", "shs"],
  curriculumKeys: ["ges"],
  modes: ["home", "online"],
  areas: "East Legon",
  yearsExperience: "6",
};

async function applied(d = deps()) {
  await submitApplication(d, application, { ip: "203.0.113.1" });
  const [row] = await db.select().from(tutorProfiles);
  return { d, row: row! };
}

describe("tutor applications", () => {
  it("stores a pending, unpublished application with a privacy-safe public name, and sends two emails", async () => {
    const { d, row } = await applied();
    expect(row).toMatchObject({
      status: "PENDING",
      isPublished: false,
      email: "ama.tutor@example.com",
      displayName: "Ama M.",
      subjects: ["Mathematics", "Integrated Science"],
      source: "application",
    });
    expect(d.mailer.sent.map((m) => m.to)).toEqual(["ama.tutor@example.com", "inbox@tmp.example"]);
    expect(d.mailer.sent[1]!.text).toContain(`https://tmp.example/admin/tutors/${row.id}`);
    expect(await listPublicTutors(db)).toEqual([]);
  });

  it("silently ignores a repeat application from the same email (no duplicate, no extra emails)", async () => {
    const { d } = await applied();
    await submitApplication(d, application, { ip: "203.0.113.1" });
    expect(await db.select().from(tutorProfiles)).toHaveLength(1);
    expect(d.mailer.sent).toHaveLength(2);
  });

  it("requires consent, valid keys, and keeps contact details out of the public introduction", async () => {
    const d = deps();
    let n = 0;
    const attempt = (over: Record<string, unknown>) => submitApplication(d, { ...application, ...over }, { ip: `198.51.100.${++n}` });
    await expect(attempt({ consent: false })).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt({ levelKeys: ["not-a-level"] })).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt({ curriculumKeys: ["nope"] })).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt({ bio: "Call me on 0244 123 4567 to book me directly." })).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt({ bio: "Email ama@example.com for lessons, I teach maths well." })).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt({ bio: "See https://example.com for my teaching background." })).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt({ modes: [] })).rejects.toBeInstanceOf(ValidationError);
    expect(await db.select().from(tutorProfiles)).toHaveLength(0);
  });

  it("rate-limits by IP", async () => {
    const d = deps();
    for (let i = 0; i < 5; i++) await submitApplication(d, { ...application, email: `t${i}@example.com` }, { ip: "198.51.100.9" });
    await expect(submitApplication(d, { ...application, email: "t9@example.com" }, { ip: "198.51.100.9" })).rejects.toBeInstanceOf(RateLimitError);
  });

  it("lets a rejected applicant apply again later", async () => {
    const admin = await makeActor(db, "admin@example.com", ["admin"]);
    const { d, row } = await applied();
    await decideTutor(d, admin, row.id, { decision: "REJECTED" });
    await submitApplication(d, application, { ip: "203.0.113.2" });
    expect(await db.select().from(tutorProfiles)).toHaveLength(2);
  });
});

describe("review workflow", () => {
  it("approve requires a complete public profile (an application has no headline yet)", async () => {
    const admin = await makeActor(db, "admin@example.com", ["admin"]);
    const { d, row } = await applied();
    await expect(decideTutor(d, admin, row.id, { decision: "APPROVED" })).rejects.toBeInstanceOf(ValidationError);
    expect((await getTutorProfile(db, admin, row.id)).status).toBe("PENDING");
    expect(await listPublicTutors(db)).toEqual([]);
  });

  it("rejects contact details in staff-edited public fields too", async () => {
    const admin = await makeActor(db, "admin@example.com", ["admin"]);
    const { row } = await applied();
    for (const bad of [{ headline: "Call 0244123456 now" }, { displayName: "ama@example.com" }, { bio: "Visit www.example.com for my full CV and background" }]) {
      await expect(updateTutorProfile(db, admin, row.id, { ...completeProfile, ...bad, sortOrder: "0" })).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it("publishes once approved, exposes only safe fields, and resolves level and curriculum names", async () => {
    const admin = await makeActor(db, "admin@example.com", ["academic_manager"]);
    const { d, row } = await applied();
    await updateTutorProfile(db, admin, row.id, { ...completeProfile, sortOrder: "0", adminNotes: "Strong references" });
    await decideTutor(d, admin, row.id, { decision: "APPROVED", message: "Welcome aboard!" }, "203.0.113.3");

    const [t] = await listPublicTutors(db);
    expect(t).toMatchObject({ displayName: "Ama M.", levels: ["Junior High School (JHS)", "Senior High School (SHS)"], curricula: ["Ghana Education Service (GES)"], modes: ["At home", "Online"] });
    // The public shape must not carry private data, by construction.
    const json = JSON.stringify(t);
    for (const secret of ["ama.tutor@example.com", "+233", "BEd Mathematics", "Strong references", "Ama Serwaa Mensah", "Weekday evenings"]) expect(json).not.toContain(secret);
    expect(Object.keys(t!).sort()).toEqual(["areas", "bio", "curricula", "displayName", "headline", "id", "levels", "modes", "photoFocusX", "photoFocusY", "photoPath", "subjects", "yearsExperience"]);
    expect(await getPublicTutor(db, row.id)).not.toBeNull();

    const last = d.mailer.last()!;
    expect(last.to).toBe("ama.tutor@example.com");
    expect(last.text).toContain("Welcome aboard!");
  });

  it("hides, shows, and un-approves without leaving a published row behind", async () => {
    const admin = await makeActor(db, "admin@example.com", ["admin"]);
    const { d, row } = await applied();
    await updateTutorProfile(db, admin, row.id, { ...completeProfile, sortOrder: "0" });
    await decideTutor(d, admin, row.id, { decision: "APPROVED" });
    await setTutorPublished(db, admin, row.id, false);
    expect(await listPublicTutors(db)).toHaveLength(0);
    await setTutorPublished(db, admin, row.id, true);
    expect(await listPublicTutors(db)).toHaveLength(1);
    await decideTutor(d, admin, row.id, { decision: "CHANGES_REQUESTED", message: "Please add your teaching registration number." });
    expect(await listPublicTutors(db)).toHaveLength(0);
    expect(await getPublicTutor(db, row.id)).toBeNull();
    await expect(setTutorPublished(db, admin, row.id, true)).rejects.toBeInstanceOf(ConflictError);
  });

  it("the database refuses a published row that is not approved", async () => {
    const { row } = await applied();
    await expect(db.update(tutorProfiles).set({ isPublished: true }).where(eq(tutorProfiles.id, row.id))).rejects.toThrow();
  });

  it("requires a message when asking for changes, and refuses repeating the same decision", async () => {
    const admin = await makeActor(db, "admin@example.com", ["admin"]);
    const { d, row } = await applied();
    await expect(decideTutor(d, admin, row.id, { decision: "CHANGES_REQUESTED" })).rejects.toBeInstanceOf(ValidationError);
    await decideTutor(d, admin, row.id, { decision: "REJECTED" });
    await expect(decideTutor(d, admin, row.id, { decision: "REJECTED" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("serialises two reviewers deciding at once: exactly one wins", async () => {
    const a = await makeActor(db, "a@example.com", ["admin"]);
    const b = await makeActor(db, "b@example.com", ["academic_manager"]);
    const { d, row } = await applied();
    await updateTutorProfile(db, a, row.id, { ...completeProfile, sortOrder: "0" });
    const results = await Promise.allSettled([
      decideTutor(d, a, row.id, { decision: "APPROVED" }),
      decideTutor(d, b, row.id, { decision: "REJECTED" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [final] = await db.select().from(tutorProfiles);
    expect(final!.isPublished).toBe(final!.status === "APPROVED");
  });

  it("audits every step", async () => {
    const admin = await makeActor(db, "admin@example.com", ["admin"]);
    const boss = await makeActor(db, "boss@example.com", ["super_admin"]);
    const { d, row } = await applied();
    await updateTutorProfile(db, admin, row.id, { ...completeProfile, sortOrder: "0" });
    await decideTutor(d, admin, row.id, { decision: "APPROVED" });
    const actions = (await listAuditLogs(db, boss)).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["tutor.application_submitted", "tutor.profile_updated", "tutor.approved"]));
  });

  it("lets staff add a tutor directly, once per email", async () => {
    const admin = await makeActor(db, "admin@example.com", ["admin"]);
    const id = await createTutorByAdmin(db, admin, { fullName: "Kofi Boateng", email: "kofi@example.com" });
    expect((await getTutorProfile(db, admin, id)).source).toBe("admin");
    await expect(createTutorByAdmin(db, admin, { fullName: "Kofi B", email: "KOFI@example.com" })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("tutor permissions", () => {
  it("only staff with the right permission can read private data or decide", async () => {
    const { d, row } = await applied();
    const tutor = await makeActor(db, "t@example.com", ["tutor"]);
    const finance = await makeActor(db, "f@example.com", ["finance_manager"]);
    const content = await makeActor(db, "c@example.com", ["content_manager"]);
    const suspended = await makeActor(db, "s@example.com", ["admin"], "SUSPENDED");
    for (const who of [tutor, finance, content, suspended, null]) {
      await expect(listTutorProfiles(db, who)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getTutorProfile(db, who, row.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updateTutorProfile(db, who, row.id, { ...completeProfile, sortOrder: "0" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(decideTutor(d, who, row.id, { decision: "APPROVED" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createTutorByAdmin(db, who, { fullName: "X Y", email: "x@example.com" })).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("the public lookup rejects malformed ids without touching the database", async () => {
    expect(await getPublicTutor(db, "not-a-uuid")).toBeNull();
    expect(await getPublicTutor(db, "'; drop table users; --")).toBeNull();
    expect((await db.execute(sql`select count(*)::int n from tutor_profiles`)).rows[0]).toEqual({ n: 0 });
  });
});

describe("admin can correct and remove tutor records", () => {
  const details = { fullName: "Ama S. Mensah", email: "New.Email@Example.com", phone: "+233 20 111 2222", qualifications: "BEd Maths; PGDE", experience: "Seven years", availability: "Saturdays" };

  it("updates private details without touching the public profile or status, and audits without personal data", async () => {
    const admin = await makeActor(db, "admin@example.com", ["admin"]);
    const boss = await makeActor(db, "boss@example.com", ["super_admin"]);
    const { row } = await applied();
    await updateTutorPrivateDetails(db, admin, row.id, details);
    const after = await getTutorProfile(db, admin, row.id);
    expect(after).toMatchObject({ fullName: "Ama S. Mensah", email: "new.email@example.com", phone: "+233 20 111 2222", status: "PENDING", displayName: "Ama M.", bio: row.bio });
    const entry = (await listAuditLogs(db, boss)).find((r) => r.action === "tutor.details_updated");
    expect(JSON.stringify([entry?.metadata, entry?.entityId])).not.toMatch(/example\.com|mensah|\+233/i);
  });

  it("refuses an email that another live tutor already uses", async () => {
    const admin = await makeActor(db, "admin@example.com", ["admin"]);
    const { d, row } = await applied();
    await submitApplication(d, { ...application, email: "other@example.com" }, { ip: "203.0.113.50" });
    await expect(updateTutorPrivateDetails(db, admin, row.id, { ...details, email: "other@example.com" })).rejects.toBeInstanceOf(ConflictError);
    await expect(updateTutorPrivateDetails(db, admin, row.id, { ...details, email: "not-an-email" })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateTutorPrivateDetails(db, admin, "00000000-0000-7000-8000-000000000000", details)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deletes a tutor for good, removes it from the public list, and keeps personal data out of the audit entry", async () => {
    const admin = await makeActor(db, "admin@example.com", ["admin"]);
    const boss = await makeActor(db, "boss@example.com", ["super_admin"]);
    const { d, row } = await applied();
    await updateTutorProfile(db, admin, row.id, { ...completeProfile, sortOrder: "0" });
    await decideTutor(d, admin, row.id, { decision: "APPROVED" });
    expect(await listPublicTutors(db)).toHaveLength(1);
    await deleteTutor(db, admin, row.id);
    expect(await listPublicTutors(db)).toHaveLength(0);
    expect(await db.select().from(tutorProfiles)).toHaveLength(0);
    await expect(deleteTutor(db, admin, row.id)).rejects.toBeInstanceOf(NotFoundError);
    const entry = (await listAuditLogs(db, boss)).find((r) => r.action === "tutor.deleted");
    expect(entry?.entityId).toBe(row.id);
    expect(JSON.stringify(entry?.metadata ?? null)).not.toMatch(/ama|mensah|example\.com|\+233/i);
  });

  it("is permission-gated: detail edits need review rights, deletion needs approval rights", async () => {
    const { row } = await applied();
    const tutor = await makeActor(db, "t@example.com", ["tutor"]);
    const content = await makeActor(db, "c@example.com", ["content_manager"]);
    for (const who of [tutor, content, null]) {
      await expect(updateTutorPrivateDetails(db, who, row.id, details)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(deleteTutor(db, who, row.id)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await db.select().from(tutorProfiles)).toHaveLength(1);
  });
});
