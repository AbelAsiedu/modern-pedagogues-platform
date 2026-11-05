import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { recordAudit } from "../audit";
import { revokeAllSessions } from "../auth/sessions";
import type { Db } from "../db";
import { roles, userRoles, users } from "../db/schema";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { assertCan, assertCanChangeRole, type Actor } from "../permissions/authorize";
import { isRoleKey, ROLE_KEYS, type RoleKey } from "../permissions/catalog";

export type AdminUserRow = {
  id: string;
  email: string;
  fullName: string;
  status: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED";
  createdAt: Date;
  lastLoginAt: Date | null;
  roles: RoleKey[];
};

export async function listUsers(db: Db, actor: Actor | null, opts: { search?: string; limit?: number; offset?: number } = {}) {
  assertCan(actor, "users.view");
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const term = opts.search?.trim();
  const where = term
    ? or(ilike(users.email, `%${term.replace(/[%_]/g, "\\$&")}%`), ilike(users.fullName, `%${term.replace(/[%_]/g, "\\$&")}%`))
    : undefined;
  const rows = await db.select().from(users).where(where).orderBy(desc(users.createdAt)).limit(limit).offset(opts.offset ?? 0);
  if (rows.length === 0) return [] as AdminUserRow[];
  const roleRows = await db
    .select({ userId: userRoles.userId, key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(inArray(userRoles.userId, rows.map((r) => r.id)))
    .orderBy(asc(roles.key));
  return rows.map((u): AdminUserRow => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    status: u.status,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    roles: roleRows.filter((r) => r.userId === u.id).map((r) => r.key).filter(isRoleKey),
  }));
}

export async function dashboardCounts(db: Db, actor: Actor | null) {
  assertCan(actor, "users.view");
  const r = await db.execute<{ total: number; active: number; pending: number; suspended: number }>(sql`
    select count(*)::int total,
           count(*) filter (where status = 'ACTIVE')::int active,
           count(*) filter (where status = 'PENDING_VERIFICATION')::int pending,
           count(*) filter (where status = 'SUSPENDED')::int suspended
    from users`);
  return r.rows[0]!;
}

async function requireUser(db: Db, userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new NotFoundError("user not found");
  return u;
}

/** Roles held by a user, used to stop a staff member suspending someone more privileged. */
async function rolesOf(db: Db, userId: string): Promise<RoleKey[]> {
  const rows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => r.key).filter(isRoleKey);
}

const PRIVILEGED = new Set<RoleKey>(["super_admin", "admin", "finance_manager"]);

export async function suspendUser(db: Db, actor: Actor | null, userId: string, reason: string, ip?: string | null) {
  assertCan(actor, "users.suspend");
  if (actor.id === userId) throw new ForbiddenError("cannot suspend yourself");
  const target = await requireUser(db, userId);
  // Only a super admin may suspend privileged staff, mirroring role-assignment rules.
  const targetRoles = await rolesOf(db, userId);
  if (targetRoles.some((r) => PRIVILEGED.has(r)) && !actor.roles.includes("super_admin")) {
    throw new ForbiddenError("only a super administrator can suspend privileged staff");
  }
  if (target.status === "SUSPENDED") throw new ConflictError("This account is already suspended.");
  const cleanReason = reason.trim().slice(0, 500);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ status: "SUSPENDED", suspendedAt: new Date(), suspensionReason: cleanReason || null }).where(eq(users.id, userId));
    await revokeAllSessions(tx, userId);
    await recordAudit(tx, { actorId: actor.id, action: "user.suspended", entityType: "user", entityId: userId, metadata: { reason: cleanReason }, ip });
  });
}

export async function restoreUser(db: Db, actor: Actor | null, userId: string, ip?: string | null) {
  assertCan(actor, "users.restore");
  const target = await requireUser(db, userId);
  if (target.status !== "SUSPENDED") throw new ConflictError("This account is not suspended.");
  await db.transaction(async (tx) => {
    // Restore to ACTIVE only if the email was verified, otherwise back to pending.
    await tx
      .update(users)
      .set({ status: target.emailVerifiedAt ? "ACTIVE" : "PENDING_VERIFICATION", suspendedAt: null, suspensionReason: null })
      .where(eq(users.id, userId));
    await recordAudit(tx, { actorId: actor.id, action: "user.restored", entityType: "user", entityId: userId, ip });
  });
}

export async function assignRole(db: Db, actor: Actor | null, userId: string, roleKey: string, ip?: string | null) {
  assertCanChangeRole(actor, userId, roleKey);
  await requireUser(db, userId);
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, roleKey)).limit(1);
  if (!role) throw new NotFoundError("role not found");
  await db.transaction(async (tx) => {
    await tx.insert(userRoles).values({ userId, roleId: role.id, assignedById: actor.id }).onConflictDoNothing();
    await recordAudit(tx, { actorId: actor.id, action: "user.role_assigned", entityType: "user", entityId: userId, metadata: { role: roleKey }, ip });
  });
}

export async function revokeRole(db: Db, actor: Actor | null, userId: string, roleKey: string, ip?: string | null) {
  assertCanChangeRole(actor, userId, roleKey);
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, roleKey)).limit(1);
  if (!role) throw new NotFoundError("role not found");
  await db.transaction(async (tx) => {
    // Never leave the platform without a super administrator.
    if (roleKey === "super_admin") {
      const [{ n }] = (await tx.execute<{ n: number }>(sql`select count(*)::int n from user_roles where role_id = ${role.id}`)).rows as [{ n: number }];
      if (n <= 1) throw new ConflictError("You cannot remove the last super administrator.");
    }
    await tx.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, role.id)));
    await recordAudit(tx, { actorId: actor.id, action: "user.role_revoked", entityType: "user", entityId: userId, metadata: { role: roleKey }, ip });
  });
  // Permissions are re-read on each request, so no session needs revoking.
}

export const ASSIGNABLE_ROLE_KEYS: readonly RoleKey[] = ROLE_KEYS;
