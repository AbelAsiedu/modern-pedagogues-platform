import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { listAuditLogs } from "@/server/admin/audit";
import { buildSiteText, listEditableContent, loadSiteText, saveContentGroup } from "@/server/content/site-content";
import { siteContent } from "@/server/db/schema";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { makeActor, openTestDb, resetData } from "../support/harness";

const { pool, db } = openTestDb();
afterAll(() => pool.end());
beforeEach(() => resetData(db));

describe("editable site text", () => {
  it("shows defaults until edited, then the edit, then defaults again after a reset", async () => {
    const editor = await makeActor(db, "ed@example.com", ["content_manager"]);
    expect((await loadSiteText(db)).text("home.talk.label")).toBe("Talk to us");

    await saveContentGroup(db, editor, "home", { "home.talk.label": "Say hello" });
    expect((await loadSiteText(db)).text("home.talk.label")).toBe("Say hello");

    await saveContentGroup(db, editor, "home", { "home.talk.label": "" });
    expect((await loadSiteText(db)).text("home.talk.label")).toBe("Talk to us");
    expect(await db.select().from(siteContent)).toHaveLength(0);
  });

  it("treats text identical to the default as 'not edited' and writes nothing", async () => {
    const editor = await makeActor(db, "ed@example.com", ["admin"]);
    const r = await saveContentGroup(db, editor, "home", { "home.talk.label": "Talk to us" });
    expect(r.changed).toEqual([]);
    expect(await db.select().from(siteContent)).toHaveLength(0);
  });

  it("records who changed what in the audit log, without storing the text itself", async () => {
    const editor = await makeActor(db, "ed@example.com", ["admin"]);
    await saveContentGroup(db, editor, "contact", { "contact.hero.title": "Reach out", "contact.where": "Accra" }, "203.0.113.5");
    const [entry] = (await listAuditLogs(db, await makeActor(db, "boss@example.com", ["super_admin"]))).filter((r) => r.action === "site_content.updated");
    expect(entry?.metadata).toEqual({ keys: expect.arrayContaining(["contact.hero.title", "contact.where"]) });
    expect(JSON.stringify(entry?.metadata)).not.toContain("Reach out");
  });

  it("refuses people without the permission, including suspended editors", async () => {
    const tutor = await makeActor(db, "t@example.com", ["tutor"]);
    const parent = await makeActor(db, "p@example.com", ["parent"]);
    const suspended = await makeActor(db, "s@example.com", ["admin"], "SUSPENDED");
    for (const who of [tutor, parent, suspended, null]) {
      await expect(saveContentGroup(db, who, "home", { "home.talk.label": "x" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listEditableContent(db, who)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await db.select().from(siteContent)).toHaveLength(0);
  });

  it("rejects over-long text, unknown sections, and newlines in single-line fields", async () => {
    const editor = await makeActor(db, "ed@example.com", ["admin"]);
    await expect(saveContentGroup(db, editor, "home", { "home.talk.label": "x".repeat(41) })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveContentGroup(db, editor, "nope", {})).rejects.toBeInstanceOf(ValidationError);
    await expect(saveContentGroup(db, editor, "home", { "home.talk.label": "a\nb" })).rejects.toBeInstanceOf(ValidationError);
    expect(await db.select().from(siteContent)).toHaveLength(0);
  });

  it("ignores keys that belong to a different section, so a form cannot write elsewhere", async () => {
    const editor = await makeActor(db, "ed@example.com", ["admin"]);
    await saveContentGroup(db, editor, "home", { "contact.where": "Hacked", "home.talk.label": "Hi" });
    const rows = await db.select().from(siteContent);
    expect(rows.map((r) => r.key)).toEqual(["home.talk.label"]);
  });

  it("is atomic: one bad value saves nothing from that submission", async () => {
    const editor = await makeActor(db, "ed@example.com", ["admin"]);
    await expect(
      saveContentGroup(db, editor, "home", { "home.talk.label": "Fine", "home.pillar1.title": "y".repeat(500) }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await db.select().from(siteContent)).toHaveLength(0);
  });

  it("falls back to default text when the database is unreachable", async () => {
    const broken = { select: () => { throw new Error("db down"); } } as never;
    expect((await loadSiteText(broken)).text("home.talk.label")).toBe("Talk to us");
  });

  it("lists the policies section only to people who may edit it, with current values", async () => {
    const editor = await makeActor(db, "ed@example.com", ["content_manager"]);
    await saveContentGroup(db, editor, "pricing", { "pricing.hero.title": "New title" });
    const groups = await listEditableContent(db, editor);
    expect(groups.map((g) => g.id)).toContain("policies");
    const entry = groups.find((g) => g.id === "pricing")!.entries.find((x) => x.key === "pricing.hero.title")!;
    expect(entry).toMatchObject({ value: "New title", isCustom: true });
    expect(await db.select().from(siteContent).where(eq(siteContent.key, "pricing.hero.title"))).toHaveLength(1);
  });
});

describe("business details and the rest of the editable site", () => {
  it("changes the business facts everywhere the text tokens and links are built, and resets cleanly", async () => {
    const admin = await makeActor(db, "ed@example.com", ["admin"]);
    expect((await loadSiteText(db)).biz.phoneTel).toBe("+233593660708");

    await saveContentGroup(db, admin, "business", {
      "site.name": "Acme Tutors",
      "site.email": "hello@acme.example",
      "site.phone": "0244 123 456",
      "site.momo_number": "0501234567",
    });
    const t = await loadSiteText(db);
    expect(t.biz).toMatchObject({ name: "Acme Tutors", email: "hello@acme.example", phoneTel: "+233244123456", momoNumber: "0501234567" });
    expect(t.whatsapp("Hi")).toBe("https://wa.me/233244123456?text=Hi");
    // Tokens inside any other text follow the edited facts.
    expect(t.text("pricing.paying.body")).toContain("0501234567");
    expect(t.text("shop.pay.steps")).toContain("0501234567");
    expect(t.text("contact.hero.intro")).not.toContain("{");

    await saveContentGroup(db, admin, "business", { "site.name": "", "site.email": "", "site.phone": "", "site.momo_number": "" });
    expect((await loadSiteText(db)).biz.name).toBe("The Modern Pedagogues");
    expect(await db.select().from(siteContent)).toHaveLength(0);
  });

  it("refuses an invalid email, phone or slideshow speed, and stores nothing", async () => {
    const admin = await makeActor(db, "ed@example.com", ["admin"]);
    await expect(saveContentGroup(db, admin, "business", { "site.email": "nope" })).rejects.toMatchObject({ fieldErrors: { "site.email": [expect.stringMatching(/valid email/)] } });
    await expect(saveContentGroup(db, admin, "business", { "site.phone": "abc" })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveContentGroup(db, admin, "home", { "home.slideshow.seconds": "1" })).rejects.toBeInstanceOf(ValidationError);
    expect(await db.select().from(siteContent)).toHaveLength(0);
  });

  it("edits menu labels, page titles and the curricula strip, and reads testimonials as empty until written", async () => {
    const admin = await makeActor(db, "ed@example.com", ["content_manager"]);
    await saveContentGroup(db, admin, "navigation", { "nav.cta": "Book a tutor" });
    await saveContentGroup(db, admin, "seo", { "seo.contact.title": "Talk to us" });
    await saveContentGroup(db, admin, "home", { "home.curricula": "GES\nIB", "home.slideshow.seconds": "9", "home.testimonials": "Wonderful | Kofi, parent" });
    const t = await loadSiteText(db);
    expect(t.text("nav.cta")).toBe("Book a tutor");
    expect(t.text("seo.contact.title")).toBe("Talk to us");
    expect(t.lines("home.curricula")).toEqual(["GES", "IB"]);
    expect(t.text("home.slideshow.seconds")).toBe("9");
    expect(t.lines("home.testimonials")).toEqual(["Wonderful | Kofi, parent"]);
    expect(buildSiteText(new Map()).lines("home.testimonials")).toEqual([]);
  });

  it("lists the business group only for people who may edit it", async () => {
    const admin = await makeActor(db, "ed@example.com", ["admin"]);
    const groups = await listEditableContent(db, admin);
    expect(groups.map((g) => g.id)).toEqual(expect.arrayContaining(["business", "navigation", "seo", "home"]));
    expect(groups.find((g) => g.id === "business")?.entries.map((e) => e.key)).toContain("site.momo_number");
  });
});
