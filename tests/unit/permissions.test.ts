import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/server/errors";
import {
  assertCan,
  can,
  canChangeRole,
  type Actor,
} from "@/server/permissions/authorize";
import { PERMISSIONS, ROLE_KEYS, ROLE_PERMISSIONS } from "@/server/permissions/catalog";

const actor = (roles: Actor["roles"], status: Actor["status"] = "ACTIVE", id = "u1"): Actor => ({ id, status, roles });

describe("permission catalog", () => {
  it("only grants permissions that exist", () => {
    for (const role of ROLE_KEYS) {
      for (const p of ROLE_PERMISSIONS[role]) expect(PERMISSIONS).toContain(p);
    }
  });
  it("gives super_admin everything", () => {
    expect(new Set(ROLE_PERMISSIONS.super_admin)).toEqual(new Set(PERMISSIONS));
  });
  it("keeps admin away from finance and privileged-role management", () => {
    const admin = new Set(ROLE_PERMISSIONS.admin);
    for (const p of PERMISSIONS) {
      if (p.startsWith("finance.") || p === "users.manage_privileged_roles" || p === "settings.manage") {
        expect(admin.has(p), p).toBe(false);
      }
    }
  });
  it("keeps portal roles out of back-office permissions", () => {
    for (const role of ["tutor", "student", "parent", "creator", "institutional_client"] as const) {
      for (const p of ROLE_PERMISSIONS[role]) expect(p.startsWith("portal.")).toBe(true);
    }
  });
});

describe("can / assertCan", () => {
  it("denies anonymous users", () => {
    expect(can(null, "users.view")).toBe(false);
    expect(can(undefined, "portal.student")).toBe(false);
  });
  it("denies suspended and unverified accounts everything, whatever their roles", () => {
    expect(can(actor(["super_admin"], "SUSPENDED"), "users.view")).toBe(false);
    expect(can(actor(["super_admin"], "PENDING_VERIFICATION"), "users.view")).toBe(false);
  });
  it("combines the permissions of several roles", () => {
    const a = actor(["tutor", "finance_manager"]);
    expect(can(a, "portal.tutor")).toBe(true);
    expect(can(a, "finance.refund")).toBe(true);
    expect(can(a, "users.suspend")).toBe(false);
  });
  it("assertCan throws ForbiddenError", () => {
    expect(() => assertCan(actor(["student"]), "finance.view")).toThrow(ForbiddenError);
    expect(() => assertCan(actor(["finance_manager"]), "finance.view")).not.toThrow();
  });
});

describe("canChangeRole (privilege escalation rules)", () => {
  it("lets only a super_admin grant super_admin, admin or finance_manager", () => {
    const superAdmin = actor(["super_admin"], "ACTIVE", "root");
    const admin = actor(["admin"], "ACTIVE", "adm");
    for (const role of ["super_admin", "admin", "finance_manager"]) {
      expect(canChangeRole(superAdmin, "target", role), role).toBe(true);
      expect(canChangeRole(admin, "target", role), role).toBe(false);
    }
  });
  it("lets an admin manage ordinary roles", () => {
    const admin = actor(["admin"], "ACTIVE", "adm");
    expect(canChangeRole(admin, "target", "tutor")).toBe(true);
    expect(canChangeRole(admin, "target", "content_manager")).toBe(true);
  });
  it("never lets anyone change their own roles", () => {
    expect(canChangeRole(actor(["super_admin"], "ACTIVE", "me"), "me", "tutor")).toBe(false);
  });
  it("rejects unknown role keys and non-admin actors", () => {
    expect(canChangeRole(actor(["super_admin"]), "t", "root")).toBe(false);
    expect(canChangeRole(actor(["student"]), "t", "tutor")).toBe(false);
    expect(canChangeRole(null, "t", "tutor")).toBe(false);
  });
});
