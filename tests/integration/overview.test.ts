import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminOverview } from "@/server/admin/overview";
import { createBanner } from "@/server/content/banners";
import { makeActor, openTestDb, resetData } from "../support/harness";

const { pool, db } = openTestDb();
afterAll(() => pool.end());
beforeEach(() => resetData(db));

describe("admin overview", () => {
  it("shows an administrator everything, with live counts", async () => {
    const admin = await makeActor(db, "a@example.com", ["admin"]);
    await createBanner(db, admin, { title: "Hello there", imagePath: "/images/slide-learning.svg", imageAlt: "x" });
    const o = await adminOverview(db, admin);
    const keys = [...o.attention, ...o.numbers].map((t) => t.key);
    expect(keys).toEqual(expect.arrayContaining(["tutors", "review", "orders", "payouts", "slides", "users"]));
    expect(o.numbers.find((t) => t.key === "slides")?.value).toBe(1);
    expect(o.numbers.find((t) => t.key === "users")?.value).toBe(1);
    expect(o.attention.every((t) => t.href.startsWith("/admin/"))).toBe(true);
    expect(Array.isArray(o.recent)).toBe(true);
  });

  it("limits what each role sees to what it may open", async () => {
    const finance = await makeActor(db, "f@example.com", ["finance_manager"]);
    const f = await adminOverview(db, finance);
    const fk = [...f.attention, ...f.numbers].map((t) => t.key);
    expect(fk).toEqual(expect.arrayContaining(["orders", "payouts", "users"]));
    expect(fk).not.toContain("slides");
    expect(fk).not.toContain("tutors");

    const content = await makeActor(db, "c@example.com", ["content_manager"]);
    const c = await adminOverview(db, content);
    const ck = [...c.attention, ...c.numbers].map((t) => t.key);
    expect(ck).toContain("slides");
    expect(ck).toContain("review");
    expect(ck).not.toContain("users");
    expect(ck).not.toContain("orders");
    expect(c.recent).toEqual([]); // no audit permission
  });

  it("shows a parent nothing", async () => {
    const parent = await makeActor(db, "p@example.com", ["parent"]);
    expect(await adminOverview(db, parent)).toEqual({ attention: [], numbers: [], recent: [] });
  });
});
