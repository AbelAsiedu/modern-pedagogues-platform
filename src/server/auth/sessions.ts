import { and, eq, gt, isNull, ne } from "drizzle-orm";
import type { DbOrTx } from "../db";
import { roles, sessions, userRoles, users } from "../db/schema";
import { isRoleKey, type RoleKey } from "../permissions/catalog";
import type { Actor } from "../permissions/authorize";
import { generateToken, hashToken } from "./tokens";

export const SESSION_IDLE_SECONDS = 7 * 24 * 60 * 60; // 7 days without use
export const SESSION_ABSOLUTE_SECONDS = 30 * 24 * 60 * 60; // hard cap, however active
/** Don't write on every request; refresh the idle window at most this often. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export const SESSION_COOKIE_NAME_PROD = "__Host-tmp_session";
export const SESSION_COOKIE_NAME_DEV = "tmp_session";
export const sessionCookieName = (production: boolean) =>
  production ? SESSION_COOKIE_NAME_PROD : SESSION_COOKIE_NAME_DEV;

export type SessionContext = { ip?: string | null; userAgent?: string | null; now?: Date };

export async function createSession(
  db: DbOrTx,
  userId: string,
  ctx: SessionContext = {},
): Promise<{ token: string; sessionId: string; expiresAt: Date; absoluteExpiresAt: Date }> {
  const now = ctx.now ?? new Date();
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + SESSION_IDLE_SECONDS * 1000);
  const absoluteExpiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_SECONDS * 1000);
  const [row] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
      absoluteExpiresAt,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent?.slice(0, 400) ?? null,
    })
    .returning({ id: sessions.id });
  if (!row) throw new Error("session insert returned no row");
  return { token, sessionId: row.id, expiresAt, absoluteExpiresAt };
}

export type SessionUser = {
  sessionId: string;
  actor: Actor;
  user: { id: string; email: string; fullName: string };
};

/**
 * Resolve a raw cookie value to the current user, or null. Always re-reads the user's status
 * and roles from the database, so suspension and role changes take effect on the next request.
 */
export async function validateSession(db: DbOrTx, rawToken: string | undefined, now = new Date()): Promise<SessionUser | null> {
  if (!rawToken || rawToken.length > 200) return null;
  const rows = await db
    .select({
      sessionId: sessions.id,
      lastUsedAt: sessions.lastUsedAt,
      absoluteExpiresAt: sessions.absoluteExpiresAt,
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(rawToken)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
        gt(sessions.absoluteExpiresAt, now),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row || row.status !== "ACTIVE") return null;

  if (now.getTime() - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    const idle = new Date(now.getTime() + SESSION_IDLE_SECONDS * 1000);
    const newExpiry = idle < row.absoluteExpiresAt ? idle : row.absoluteExpiresAt;
    await db.update(sessions).set({ lastUsedAt: now, expiresAt: newExpiry }).where(eq(sessions.id, row.sessionId));
  }

  const roleRows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, row.userId));
  const roleKeys: RoleKey[] = roleRows.map((r) => r.key).filter(isRoleKey);

  return {
    sessionId: row.sessionId,
    actor: { id: row.userId, status: row.status, roles: roleKeys },
    user: { id: row.userId, email: row.email, fullName: row.fullName },
  };
}

export async function revokeSessionByToken(db: DbOrTx, rawToken: string, now = new Date()): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.tokenHash, hashToken(rawToken)), isNull(sessions.revokedAt)));
}

/** Sign a user out everywhere, optionally keeping one session (for "change password"). */
export async function revokeAllSessions(db: DbOrTx, userId: string, exceptSessionId?: string, now = new Date()): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined,
      ),
    );
}
