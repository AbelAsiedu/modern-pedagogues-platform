import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBanner } from "@/server/content/banners";
import { heroBanners, mediaFiles, tutorProfiles } from "@/server/db/schema";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors";
import { deleteMedia, getMediaFile, listMedia, mediaOptions, saveImage, updateMediaAlt } from "@/server/media/service";
import { createTutorByAdmin, profileEditInput, updateTutorProfile, getPublicTutor } from "@/server/tutors/service";
import { makeActor, openTestDb, resetData } from "../support/harness";

const { pool, db } = openTestDb();
afterAll(() => pool.end());
beforeEach(() => resetData(db));

const png = () => sharp({ create: { width: 30, height: 20, channels: 3, background: "#123456" } }).png().toBuffer();

describe("media library", () => {
  it("stores a re-encoded image, lists it without its bytes, and serves it publicly", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const saved = await saveImage(db, admin, { filename: "Front Cover.png", bytes: await png(), altText: " A blue box " }, "203.0.113.9");
    expect(saved.path).toMatch(/^\/media\/[0-9a-f-]{36}\.png$/);

    const [item] = await listMedia(db, admin);
    expect(item).toMatchObject({ filename: "Front Cover.png", contentType: "image/png", width: 30, height: 20, altText: "A blue box", path: saved.path });
    expect(item).not.toHaveProperty("data");
    expect(await mediaOptions(db, admin)).toEqual([{ value: saved.path, label: "Front Cover.png (30×20)" }]);

    const served = await getMediaFile(db, saved.id);
    expect(served?.contentType).toBe("image/png");
    expect((await sharp(served!.data).metadata()).format).toBe("png");
    expect(await getMediaFile(db, "not-an-id")).toBeNull();
    expect(await getMediaFile(db, "00000000-0000-7000-8000-000000000000")).toBeNull();
  });

  it("cleans awkward file names", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    await saveImage(db, admin, { filename: "../../etc/pass<wd>.png", bytes: await png() });
    const [item] = await listMedia(db, admin);
    expect(item?.filename).not.toMatch(/[<>/\\]/);
  });

  it("lets content managers upload, but not parents, tutors, finance staff or suspended admins", async () => {
    const editor = await makeActor(db, "e@example.com", ["content_manager"]);
    await expect(saveImage(db, editor, { filename: "x.png", bytes: await png() })).resolves.toBeTruthy();
    const others = [
      await makeActor(db, "p@example.com", ["parent"]),
      await makeActor(db, "t@example.com", ["tutor"]),
      await makeActor(db, "f@example.com", ["finance_manager"]),
      await makeActor(db, "s@example.com", ["admin"], "SUSPENDED"),
      null,
    ];
    for (const who of others) {
      await expect(saveImage(db, who, { filename: "x.png", bytes: await png() })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listMedia(db, who)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await db.select().from(mediaFiles)).toHaveLength(1);
  });

  it("rejects non-images and stores nothing", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    await expect(saveImage(db, admin, { filename: "evil.svg", bytes: Buffer.from("<svg onload=alert(1)/>") })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.select().from(mediaFiles)).toHaveLength(0);
  });

  it("refuses to delete a picture a banner or a tutor is using, and deletes it once free", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const saved = await saveImage(db, admin, { filename: "x.png", bytes: await png() });

    await createBanner(db, admin, { title: "Hello there", imagePath: saved.path, imageAlt: "x" });
    await expect(deleteMedia(db, admin, saved.id)).rejects.toBeInstanceOf(ConflictError);
    await db.delete(heroBanners);

    const tutor = await createTutorByAdmin(db, admin, { fullName: "Ama Mensah", email: "ama@example.com" });
    await db.update(tutorProfiles).set({ photoPath: saved.path }).where(eq(tutorProfiles.id, tutor));
    await expect(deleteMedia(db, admin, saved.id)).rejects.toBeInstanceOf(ConflictError);
    await db.update(tutorProfiles).set({ photoPath: null });

    await deleteMedia(db, admin, saved.id);
    expect(await db.select().from(mediaFiles)).toHaveLength(0);
    await expect(deleteMedia(db, admin, saved.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("edits the description", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const saved = await saveImage(db, admin, { filename: "x.png", bytes: await png() });
    await updateMediaAlt(db, admin, saved.id, "A new description");
    expect((await listMedia(db, admin))[0]?.altText).toBe("A new description");
  });
});

describe("tutor photos", () => {
  const profile = {
    displayName: "Ama M.", headline: "Maths specialist for SHS", bio: "I teach mathematics with patience and clear worked examples every week.",
    subjects: "Maths", levelKeys: ["shs"], curriculumKeys: [], modes: ["home"], areas: "", yearsExperience: "", sortOrder: "0", adminNotes: "",
  };

  it("accepts only pictures from the media library", () => {
    const ok = profileEditInput.safeParse({ ...profile, photoPath: "/media/0194b2c8-1d3a-7c4e-9a52-0f6a1b2c3d4e.jpg" });
    expect(ok.success).toBe(true);
    for (const bad of ["https://evil.example/x.jpg", "//evil.example/x.jpg", "/media/../secret.jpg", "/images/x.svg", "javascript:alert(1)"]) {
      expect(profileEditInput.safeParse({ ...profile, photoPath: bad }).success, bad).toBe(false);
    }
    expect(profileEditInput.safeParse({ ...profile, photoPath: "" }).success).toBe(true);
  });

  it("shows the photo on the public profile once the tutor is approved and published", async () => {
    const admin = await makeActor(db, "a@example.com", ["super_admin"]);
    const pic = await saveImage(db, admin, { filename: "ama.png", bytes: await png() });
    const t = await createTutorByAdmin(db, admin, { fullName: "Ama Mensah", email: "ama@example.com" });
    await db.update(tutorProfiles).set({ status: "APPROVED", isPublished: true }).where(eq(tutorProfiles.id, t));
    await updateTutorProfile(db, admin, t, { ...profile, photoPath: pic.path });
    expect((await getPublicTutor(db, t))?.photoPath).toBe(pic.path);
  });
});
