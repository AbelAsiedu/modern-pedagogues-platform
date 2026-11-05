import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { listAuditLogs } from "@/server/admin/audit";
import { assignRole, dashboardCounts, listUsers, restoreUser, revokeRole, suspendUser } from "@/server/admin/users";
import { validateSession } from "@/server/auth/sessions";
import {
  createBanner,
  deleteBanner,
  getPublicBanners,
  getPublicBannersOrDefaults,
  listAllBanners,
  setBannerActive,
  updateBanner,
  DEFAULT_BANNERS,
} from "@/server/content/banners";
import { roles, userRoles, users } from "@/server/db/schema";
import { ForbiddenError, ValidationError, ConflictError } from "@/server/errors";
import type { Actor } from "@/server/permissions/authorize";
import type { RoleKey } from "@/server/permissions/catalog";
import { GOOD_PASSWORD, makeAuth, newUser, openTestDb, resetData } from "../support/harness";

const { pool, db } = openTestDb();
afterAll(() => pool.end());
beforeEach(() => resetData(db));

async function makeUser(email: string, roleKeys: RoleKey[], status: "ACTIVE" | "PENDING_VERIFICATION" | "SUSPENDED" = "ACTIVE"): Promise<Actor> {
  const [u] = await db
    .insert(users)
    .values({ email, fullName: email.split("@")[0]!, status, emailVerifiedAt: status === "PENDING_VERIFICATION" ? null : new Date() })
    .returning({ id: users.id });
  for (const key of roleKeys) {
    const [r] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key));
    await db.insert(userRoles).values({ userId: u!.id, roleId: r!.id });
  }
  return { id: u!.id, status, roles: roleKeys };
}

const banner = { title: "Welcome", imagePath: "/images/slide-learning.svg", buttonText: "Go", buttonUrl: "/contact" };

describe("admin banners", () => {
  it("lets content staff create, edit, hide and delete, with audit entries", async () => {
    const editor = await makeUser("editor@example.com", ["content_manager"]);
    const id = await createBanner(db, editor, { ...banner, sortOrder: 2 });
    await createBanner(db, editor, { ...banner, title: "First", sortOrder: 1 });
    expect((await getPublicBanners(db)).map((b) => b.title)).toEqual(["First", "Welcome"]);

    await updateBanner(db, editor, id, { ...banner, title: "Renamed", sortOrder: 0 });
    expect((await getPublicBanners(db))[0]!.title).toBe("Renamed");

    await setBannerActive(db, editor, id, false);
    expect((await getPublicBanners(db)).map((b) => b.title)).toEqual(["First"]);
    expect(await listAllBanners(db, editor)).toHaveLength(2);

    await deleteBanner(db, editor, id);
    expect(await listAllBanners(db, editor)).toHaveLength(1);

    const admin = await makeUser("admin@example.com", ["admin"]);
    const actions = (await listAuditLogs(db, admin)).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["banner.created", "banner.updated", "banner.deactivated", "banner.deleted"]));
  });

  it("refuses everyone without the content permission", async () => {
    for (const roleKeys of [["student"], ["tutor"], ["finance_manager"], []] as RoleKey[][]) {
      const a = await makeUser(`u${roleKeys.join("")}@example.com`, roleKeys);
      await expect(createBanner(db, a, banner)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listAllBanners(db, a)).rejects.toBeInstanceOf(ForbiddenError);
    }
    await expect(createBanner(db, null, banner)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a suspended editor", async () => {
    const a = await makeUser("susp@example.com", ["content_manager"], "SUSPENDED");
    await expect(createBanner(db, a, banner)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects unsafe images and links", async () => {
    const editor = await makeUser("editor@example.com", ["content_manager"]);
    await expect(createBanner(db, editor, { ...banner, imagePath: "https://evil.example/x.png" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createBanner(db, editor, { ...banner, buttonUrl: "javascript:alert(1)" })).rejects.toBeInstanceOf(ValidationError);
    expect(await listAllBanners(db, editor)).toHaveLength(0);
  });

  it("falls back to the default slides when none are active", async () => {
    const slides = await getPublicBannersOrDefaults(db);
    expect(slides.map((s) => s.title)).toEqual(DEFAULT_BANNERS.map((s) => s.title));
  });

  it("falls back to defaults rather than failing when the database is unavailable", async () => {
    const broken = (() => {
      throw new Error("db down");
    }) as never;
    expect(await getPublicBannersOrDefaults(broken)).toHaveLength(3);
  });
});

describe("admin user management", () => {
  it("lists users with roles and counts, with search", async () => {
    const admin = await makeUser("admin@example.com", ["admin"]);
    await makeUser("ama.parent@example.com", ["parent"]);
    await makeUser("kofi@example.com", ["student"], "PENDING_VERIFICATION");
    const all = await listUsers(db, admin);
    expect(all).toHaveLength(3);
    expect(all.find((u) => u.email === "ama.parent@example.com")!.roles).toEqual(["parent"]);
    expect((await listUsers(db, admin, { search: "ama" })).map((u) => u.email)).toEqual(["ama.parent@example.com"]);
    expect(await listUsers(db, admin, { search: "%" })).toHaveLength(0); // wildcard is escaped, not a match-all
    const c = await dashboardCounts(db, admin);
    expect(c).toMatchObject({ total: 3, active: 2, pending: 1, suspended: 0 });
  });

  it("denies user data to people without users.view", async () => {
    const tutor = await makeUser("t@example.com", ["tutor"]);
    await expect(listUsers(db, tutor)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(dashboardCounts(db, tutor)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("suspending a user ends their sessions at once, and restoring lets them back in", async () => {
    const h = makeAuth(db);
    const admin = await makeUser("admin@example.com", ["admin"]);
    await h.auth.register(newUser("ama@example.com"));
    await h.auth.verifyEmail(h.tokenFromLast());
    const { token, userId } = await h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD });
    expect(await validateSession(db, token)).not.toBeNull();

    await suspendUser(db, admin, userId, "Payment dispute");
    expect(await validateSession(db, token)).toBeNull();
    await expect(h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD })).rejects.toMatchObject({ code: "ACCOUNT_SUSPENDED" });
    await expect(suspendUser(db, admin, userId, "again")).rejects.toBeInstanceOf(ConflictError);

    await restoreUser(db, admin, userId);
    await expect(h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD })).resolves.toHaveProperty("token");

    const actions = (await listAuditLogs(db, admin)).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["user.suspended", "user.restored"]));
  });

  it("restoring an unverified user returns them to pending, not active", async () => {
    const admin = await makeUser("admin@example.com", ["admin"]);
    const pending = await makeUser("p@example.com", ["parent"], "PENDING_VERIFICATION");
    await suspendUser(db, admin, pending.id, "test");
    await restoreUser(db, admin, pending.id);
    expect((await db.select().from(users).where(eq(users.id, pending.id)))[0]!.status).toBe("PENDING_VERIFICATION");
  });

  it("stops staff suspending themselves, and stops an admin suspending privileged staff", async () => {
    const root = await makeUser("root@example.com", ["super_admin"]);
    const admin = await makeUser("admin@example.com", ["admin"]);
    const finance = await makeUser("fin@example.com", ["finance_manager"]);
    await expect(suspendUser(db, admin, admin.id, "x")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(suspendUser(db, admin, root.id, "x")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(suspendUser(db, admin, finance.id, "x")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(suspendUser(db, root, finance.id, "x")).resolves.toBeUndefined();
  });

  it("enforces role-escalation rules end to end", async () => {
    const root = await makeUser("root@example.com", ["super_admin"]);
    const admin = await makeUser("admin@example.com", ["admin"]);
    const target = await makeUser("t@example.com", ["parent"]);

    await expect(assignRole(db, admin, target.id, "admin")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assignRole(db, admin, target.id, "super_admin")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assignRole(db, admin, admin.id, "tutor")).rejects.toBeInstanceOf(ForbiddenError); // self
    await expect(assignRole(db, target, target.id, "admin")).rejects.toBeInstanceOf(ForbiddenError);

    await assignRole(db, admin, target.id, "tutor");
    await assignRole(db, root, target.id, "finance_manager");
    const [u] = await listUsers(db, root, { search: "t@example.com" });
    expect(u!.roles).toEqual(expect.arrayContaining(["parent", "tutor", "finance_manager"]));

    await revokeRole(db, admin, target.id, "tutor");
    await expect(revokeRole(db, admin, target.id, "finance_manager")).rejects.toBeInstanceOf(ForbiddenError);
    await revokeRole(db, root, target.id, "finance_manager");
    const [after] = await listUsers(db, root, { search: "t@example.com" });
    expect(after!.roles).toEqual(["parent"]);
  });

  it("never removes the last super administrator, even from a concurrent request holding stale roles", async () => {
    const root = await makeUser("root@example.com", ["super_admin"]);
    const other = await makeUser("other@example.com", ["super_admin"]);

    // Self-removal is blocked outright.
    await expect(revokeRole(db, root, root.id, "super_admin")).rejects.toBeInstanceOf(ForbiddenError);

    // `other` removes `root`: allowed, one super admin remains.
    await revokeRole(db, other, root.id, "super_admin");

    // A concurrent request still carrying root's old in-memory roles tries to remove the last one.
    await expect(revokeRole(db, root, other.id, "super_admin")).rejects.toBeInstanceOf(ConflictError);
    const [stillThere] = await listUsers(db, other, { search: "other@example.com" });
    expect(stillThere!.roles).toContain("super_admin");
  });

  it("audit log is visible only to roles with audit.view", async () => {
    const student = await makeUser("s@example.com", ["student"]);
    const finance = await makeUser("f@example.com", ["finance_manager"]);
    await expect(listAuditLogs(db, student)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listAuditLogs(db, finance)).resolves.toBeDefined();
  });
});
