import { ForbiddenError } from "../errors";
import {
  isRoleKey,
  PRIVILEGED_ROLES,
  ROLE_PERMISSIONS,
  type Permission,
  type RoleKey,
} from "./catalog";

/** The minimal identity every authorization decision is made from. Always load it from the database, never the client. */
export type Actor = Readonly<{
  id: string;
  status: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED";
  roles: readonly RoleKey[];
}>;

export function permissionsFor(roles: readonly RoleKey[]): ReadonlySet<Permission> {
  const set = new Set<Permission>();
  for (const role of roles) for (const p of ROLE_PERMISSIONS[role] ?? []) set.add(p);
  return set;
}

/** Only active, verified accounts hold any permission. Suspended or unverified users hold none. */
export function can(actor: Actor | null | undefined, permission: Permission): boolean {
  if (!actor || actor.status !== "ACTIVE") return false;
  return permissionsFor(actor.roles).has(permission);
}

export function assertCan(actor: Actor | null | undefined, permission: Permission): asserts actor is Actor {
  if (!can(actor, permission)) throw new ForbiddenError(`missing permission: ${permission}`);
}

export function hasRole(actor: Actor | null | undefined, role: RoleKey): boolean {
  return !!actor && actor.status === "ACTIVE" && actor.roles.includes(role);
}

/**
 * Role-assignment guard. Rules:
 *  - Nobody can change their own roles (blocks self-promotion).
 *  - Privileged roles (super_admin, admin, finance_manager) need `users.manage_privileged_roles`.
 *  - Everything else needs `users.manage_roles`.
 */
export function canChangeRole(actor: Actor | null | undefined, targetUserId: string, roleKey: string): boolean {
  if (!actor || !isRoleKey(roleKey)) return false;
  if (actor.id === targetUserId) return false;
  const needed: Permission = PRIVILEGED_ROLES.includes(roleKey)
    ? "users.manage_privileged_roles"
    : "users.manage_roles";
  return can(actor, needed);
}

export function assertCanChangeRole(
  actor: Actor | null | undefined,
  targetUserId: string,
  roleKey: string,
): asserts actor is Actor {
  if (!canChangeRole(actor, targetUserId, roleKey)) {
    throw new ForbiddenError(`not permitted to change role ${roleKey}`);
  }
}
