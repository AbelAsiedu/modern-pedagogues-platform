import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { listImageSlots, setImageSlot } from "@/server/content/images";
import { loadSiteText, saveContentGroup } from "@/server/content/site-content";
import { siteContent } from "@/server/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { deleteMedia, mediaUsage, replaceMedia, saveImage } from "@/server/media/service";
import { makeActor, openTestDb, resetData } from "../support/harness";

const { pool, db } = openTestDb();
afterAll(() => pool.end());
beforeEach(() => resetData(db));

const png = (bg = "#123456") => sharp({ create: { width: 30, height: 20, channels: 3, background: bg } }).png().toBuffer();

describe("site picture slots", () => {
  it("lists every slot empty at first, so the built-in illustrations show", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const slots = await listImageSlots(db, admin);
    expect(slots.map((x) => x.key)).toEqual(expect.arrayContaining(["site.logo", "home.about.image", "page.tutors.image", "page.contact.image"]));
    expect(slots.every((x) => x.path === "")).toBe(true);
    expect((await loadSiteText(db)).image("home.about.image")).toBe("");
  });

  it("covers the favicon, share picture, Kaitlyn, About story and all six service cards", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const keys = (await listImageSlots(db, admin)).map((x) => x.key);
    expect(keys).toEqual(expect.arrayContaining(["site.favicon", "site.share_image", "assistant.avatar", "about.story.image", "service.1.image", "service.6.image"]));
    const pic = await saveImage(db, admin, { filename: "k.png", bytes: await png(), altText: "Kaitlyn smiling" });
    await setImageSlot(db, admin, "assistant.avatar", pic.path);
    await setImageSlot(db, admin, "service.3.image", pic.path);
    const t = await loadSiteText(db);
    expect(t.image("assistant.avatar")).toBe(pic.path);
    expect(t.imageAlt("service.3.image")).toBe("Kaitlyn smiling");
    expect(t.image("service.4.image")).toBe("");
  });

  it("puts a library picture into a slot, serves it with its description, and empties it again", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const pic = await saveImage(db, admin, { filename: "team.png", bytes: await png(), altText: "Our tutors at work" });
    await setImageSlot(db, admin, "home.about.image", pic.path, "203.0.113.7");
    const t = await loadSiteText(db);
    expect(t.image("home.about.image")).toBe(pic.path);
    expect(t.imageAlt("home.about.image")).toBe("Our tutors at work");

    await setImageSlot(db, admin, "home.about.image", "");
    expect((await loadSiteText(db)).image("home.about.image")).toBe("");
    expect(await db.select().from(siteContent)).toHaveLength(0);
  });

  it("refuses unknown slots, text slots, made-up paths and pictures that are not in the library", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const pic = await saveImage(db, admin, { filename: "x.png", bytes: await png() });
    await expect(setImageSlot(db, admin, "no.such.slot", pic.path)).rejects.toBeInstanceOf(ValidationError);
    await expect(setImageSlot(db, admin, "home.talk.label", pic.path)).rejects.toBeInstanceOf(ValidationError);
    await expect(setImageSlot(db, admin, "home.about.image", "https://evil.example/x.png")).rejects.toBeInstanceOf(ValidationError);
    await expect(setImageSlot(db, admin, "home.about.image", "/media/00000000-0000-7000-8000-000000000000.png")).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.select().from(siteContent)).toHaveLength(0);
  });

  it("is for site editors only", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const creator = await makeActor(db, "c@example.com", ["creator"]);
    const pic = await saveImage(db, admin, { filename: "x.png", bytes: await png() });
    await expect(setImageSlot(db, creator, "home.about.image", pic.path)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setImageSlot(db, null, "home.about.image", pic.path)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listImageSlots(db, creator)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("is not changed by saving a text group, and image slots are not text fields", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const pic = await saveImage(db, admin, { filename: "x.png", bytes: await png() });
    await setImageSlot(db, admin, "home.cta.image", pic.path);
    await saveContentGroup(db, admin, "home", { "home.talk.label": "Say hello" });
    expect((await loadSiteText(db)).image("home.cta.image")).toBe(pic.path);
    await expect(saveContentGroup(db, admin, "images", { "home.cta.image": "/media/x.png" })).resolves.toMatchObject({ changed: [] });
  });

  it("protects a picture in use, and Replace moves the slot to the new picture", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    const old = await saveImage(db, admin, { filename: "old.png", bytes: await png() });
    await setImageSlot(db, admin, "page.about.image", old.path);
    expect(await mediaUsage(db, old.path)).toContain("a site picture");
    await expect(deleteMedia(db, admin, old.id)).rejects.toMatchObject({ code: "CONFLICT" });

    const r = await replaceMedia(db, admin, old.id, { filename: "new.png", bytes: await png("#aa3322") });
    expect(r.moved.slots).toBe(1);
    const rows = await db.select().from(siteContent).where(eq(siteContent.key, "page.about.image"));
    expect(rows[0]?.value).toBe(r.path);
  });
});
