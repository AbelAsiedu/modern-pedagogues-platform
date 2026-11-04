import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "../db";
import {
  emailDeliveries,
  emailVerificationTokens,
  passwordResetTokens,
  roles,
  userRoles,
  users,
} from "../db/schema";
import { recordAudit } from "../audit";
import {
  AccountLockedError,
  AccountSuspendedError,
  EmailNotVerifiedError,
  InvalidCredentialsError,
  InvalidTokenError,
  RateLimitError,
} from "../errors";
import type { Mailer, EmailMessage } from "../email/mailer";
import {
  accountExistsMessage,
  passwordChangedMessage,
  passwordResetMessage,
  verifyEmailMessage,
} from "../email/templates";
import type { Logger } from "../logger";
import { hashPassword, passwordSchema, verifyAgainstDummy, verifyPassword } from "./password";
import { enforceRateLimit } from "./rate-limit";
import { createSession, revokeAllSessions, revokeSessionByToken } from "./sessions";
import { generateToken, hashToken } from "./tokens";
import { emailSchema, loginSchema, parseOrThrow, registerSchema, tokenSchema, type RegisterInput } from "./validation";

export const VERIFY_TTL_SECONDS = 24 * 60 * 60;
export const RESET_TTL_SECONDS = 60 * 60;
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_SECONDS = 15 * 60;

export type AuthDeps = {
  db: Db;
  mailer: Mailer;
  log: Logger;
  appUrl: string;
  now?: () => Date;
};

export type RequestContext = { ip?: string | null; userAgent?: string | null };

const PG_UNIQUE_VIOLATION = "23505";
const isUniqueViolation = (e: unknown): boolean =>
  typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === PG_UNIQUE_VIOLATION;

export function createAuthService(deps: AuthDeps) {
  const { db, mailer, log } = deps;
  const now = () => (deps.now ? deps.now() : new Date());
  const link = (path: string, token: string) => `${deps.appUrl.replace(/\/$/, "")}${path}?token=${encodeURIComponent(token)}`;
  const ipKey = (ctx: RequestContext) => ctx.ip ?? "unknown";

  /** Queue, send and record an email. A delivery failure is logged and recorded but never surfaces to the requester. */
  async function deliver(message: EmailMessage & { template: string }): Promise<void> {
    const [row] = await db
      .insert(emailDeliveries)
      .values({ toEmail: message.to, template: message.template, subject: message.subject })
      .returning({ id: emailDeliveries.id });
    try {
      const { providerId } = await mailer.send(message);
      if (row) {
        await db
          .update(emailDeliveries)
          .set({ status: "SENT", attempts: 1, providerId, sentAt: now() })
          .where(eq(emailDeliveries.id, row.id));
      }
    } catch (err) {
      log.error({ err, template: message.template }, "email delivery failed");
      if (row) {
        await db
          .update(emailDeliveries)
          .set({ status: "FAILED", attempts: 1, error: err instanceof Error ? err.message.slice(0, 500) : "unknown" })
          .where(eq(emailDeliveries.id, row.id));
      }
    }
  }

  async function issueVerificationToken(tx: DbOrTx, userId: string): Promise<string> {
    await tx
      .delete(emailVerificationTokens)
      .where(and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.usedAt)));
    const token = generateToken();
    await tx.insert(emailVerificationTokens).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(now().getTime() + VERIFY_TTL_SECONDS * 1000),
    });
    return token;
  }

  async function issueResetToken(tx: DbOrTx, userId: string): Promise<string> {
    await tx
      .delete(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
    const token = generateToken();
    await tx.insert(passwordResetTokens).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(now().getTime() + RESET_TTL_SECONDS * 1000),
    });
    return token;
  }

  async function findUserByEmail(email: string) {
    const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return u;
  }

  return {
    /**
     * Self-service sign-up. The response is identical whether or not the email already has an account;
     * an existing account owner is emailed instead, so the form cannot be used to discover who is registered.
     */
    async register(input: RegisterInput, ctx: RequestContext = {}): Promise<{ ok: true }> {
      const data = parseOrThrow(registerSchema, input);
      await enforceRateLimit(db, { key: `register:ip:${ipKey(ctx)}`, limit: 10, windowSeconds: 3600 });

      // Hash first in every branch so response time does not reveal whether the email exists.
      const passwordHash = await hashPassword(data.password);
      const existing = await findUserByEmail(data.email);

      if (existing) {
        await enforceRateLimit(db, { key: `register:email:${data.email}`, limit: 3, windowSeconds: 3600 }).catch(() => undefined);
        const token = await issueResetToken(db, existing.id);
        await deliver(accountExistsMessage(existing.email, existing.fullName, link("/reset-password", token)));
        return { ok: true };
      }

      let created: { id: string; token: string } | undefined;
      try {
        created = await db.transaction(async (tx) => {
          const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.key, data.role)).limit(1);
          if (!role) throw new Error(`role "${data.role}" is not seeded; run npm run db:seed`);
          const [user] = await tx
            .insert(users)
            .values({ email: data.email, fullName: data.fullName, phone: data.phone ?? null, passwordHash })
            .returning({ id: users.id });
          if (!user) throw new Error("user insert returned no row");
          await tx.insert(userRoles).values({ userId: user.id, roleId: role.id });
          const token = await issueVerificationToken(tx, user.id);
          await recordAudit(tx, {
            actorId: user.id,
            action: "user.registered",
            entityType: "user",
            entityId: user.id,
            metadata: { role: data.role },
            ip: ctx.ip,
          });
          return { id: user.id, token };
        });
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: true }; // lost a race with another sign-up for the same email
        throw err;
      }

      await deliver(verifyEmailMessage(data.email, data.fullName, link("/verify-email", created.token)));
      return { ok: true };
    },

    async verifyEmail(rawToken: string, ctx: RequestContext = {}): Promise<{ ok: true }> {
      const token = tokenSchema.safeParse(rawToken);
      if (!token.success) throw new InvalidTokenError();
      const at = now();
      const userId = await db.transaction(async (tx) => {
        // Claiming the token is a single conditional UPDATE, so two concurrent clicks cannot both succeed.
        const [claimed] = await tx
          .update(emailVerificationTokens)
          .set({ usedAt: at })
          .where(
            and(
              eq(emailVerificationTokens.tokenHash, hashToken(token.data)),
              isNull(emailVerificationTokens.usedAt),
              gt(emailVerificationTokens.expiresAt, at),
            ),
          )
          .returning({ userId: emailVerificationTokens.userId });
        if (!claimed) return null;
        await tx
          .update(users)
          .set({
            emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${at})`,
            status: sql`case when ${users.status} = 'PENDING_VERIFICATION' then 'ACTIVE'::user_status else ${users.status} end`,
          })
          .where(eq(users.id, claimed.userId));
        await recordAudit(tx, { actorId: claimed.userId, action: "user.email_verified", entityType: "user", entityId: claimed.userId, ip: ctx.ip });
        return claimed.userId;
      });
      if (!userId) throw new InvalidTokenError();
      return { ok: true };
    },

    /** Always returns ok, whatever the address. */
    async resendVerification(rawEmail: string, ctx: RequestContext = {}): Promise<{ ok: true }> {
      const email = parseOrThrow(emailSchema, rawEmail);
      await enforceRateLimit(db, { key: `verify-resend:ip:${ipKey(ctx)}`, limit: 10, windowSeconds: 3600 });
      const limited = await enforceRateLimit(db, { key: `verify-resend:email:${email}`, limit: 3, windowSeconds: 3600 })
        .then(() => false)
        .catch(() => true);
      if (limited) return { ok: true };
      const user = await findUserByEmail(email);
      if (user && user.status === "PENDING_VERIFICATION") {
        const token = await issueVerificationToken(db, user.id);
        await deliver(verifyEmailMessage(user.email, user.fullName, link("/verify-email", token)));
      }
      return { ok: true };
    },

    async login(input: { email: string; password: string }, ctx: RequestContext = {}) {
      const data = parseOrThrow(loginSchema, input);
      try {
        await enforceRateLimit(db, { key: `login:ip:${ipKey(ctx)}`, limit: 40, windowSeconds: 600 });
        await enforceRateLimit(db, { key: `login:email:${data.email}`, limit: 10, windowSeconds: 900 });
      } catch (err) {
        if (err instanceof RateLimitError) throw new AccountLockedError(err.retryAfterSeconds);
        throw err;
      }

      const user = await findUserByEmail(data.email);
      if (!user || !user.passwordHash) {
        await verifyAgainstDummy(data.password);
        throw new InvalidCredentialsError();
      }

      const at = now();
      if (user.lockedUntil && user.lockedUntil > at) {
        throw new AccountLockedError(Math.ceil((user.lockedUntil.getTime() - at.getTime()) / 1000));
      }

      const ok = await verifyPassword(user.passwordHash, data.password);
      if (!ok) {
        // Atomic increment; lock when the threshold is reached.
        const [updated] = await db
          .update(users)
          .set({
            failedLoginCount: sql`${users.failedLoginCount} + 1`,
            lockedUntil: sql`case when ${users.failedLoginCount} + 1 >= ${MAX_FAILED_LOGINS}
              then ${new Date(at.getTime() + LOCKOUT_SECONDS * 1000)}::timestamptz else ${users.lockedUntil} end`,
          })
          .where(eq(users.id, user.id))
          .returning({ failed: users.failedLoginCount });
        if (updated && updated.failed >= MAX_FAILED_LOGINS) {
          await recordAudit(db, { actorId: user.id, action: "user.locked_out", entityType: "user", entityId: user.id, ip: ctx.ip });
        }
        throw new InvalidCredentialsError();
      }

      // Correct password from here on, so it is safe to say why a sign-in is refused.
      if (user.status === "SUSPENDED") throw new AccountSuspendedError();
      if (user.status === "PENDING_VERIFICATION" || !user.emailVerifiedAt) throw new EmailNotVerifiedError();

      await db
        .update(users)
        .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: at })
        .where(eq(users.id, user.id));
      const session = await createSession(db, user.id, { ...ctx, now: at });
      await recordAudit(db, { actorId: user.id, action: "user.login", entityType: "user", entityId: user.id, ip: ctx.ip });
      return { token: session.token, expiresAt: session.expiresAt, userId: user.id };
    },

    async logout(rawToken: string | undefined): Promise<void> {
      if (rawToken) await revokeSessionByToken(db, rawToken, now());
    },

    /** Always returns ok. Also used to set the first password of an admin-created account. */
    async requestPasswordReset(rawEmail: string, ctx: RequestContext = {}): Promise<{ ok: true }> {
      const email = parseOrThrow(emailSchema, rawEmail);
      await enforceRateLimit(db, { key: `reset:ip:${ipKey(ctx)}`, limit: 10, windowSeconds: 3600 });
      const limited = await enforceRateLimit(db, { key: `reset:email:${email}`, limit: 3, windowSeconds: 3600 })
        .then(() => false)
        .catch(() => true);
      if (limited) return { ok: true };
      const user = await findUserByEmail(email);
      if (user && user.status !== "SUSPENDED") {
        const token = await issueResetToken(db, user.id);
        await recordAudit(db, { actorId: user.id, action: "user.password_reset_requested", entityType: "user", entityId: user.id, ip: ctx.ip });
        await deliver(passwordResetMessage(user.email, user.fullName, link("/reset-password", token)));
      }
      return { ok: true };
    },

    async resetPassword(rawToken: string, newPassword: string, ctx: RequestContext = {}): Promise<{ ok: true }> {
      const token = tokenSchema.safeParse(rawToken);
      if (!token.success) throw new InvalidTokenError();
      const password = parseOrThrow(passwordSchema, newPassword);
      const passwordHash = await hashPassword(password);
      const at = now();
      const result = await db.transaction(async (tx) => {
        const [claimed] = await tx
          .update(passwordResetTokens)
          .set({ usedAt: at })
          .where(
            and(
              eq(passwordResetTokens.tokenHash, hashToken(token.data)),
              isNull(passwordResetTokens.usedAt),
              gt(passwordResetTokens.expiresAt, at),
            ),
          )
          .returning({ userId: passwordResetTokens.userId });
        if (!claimed) return null;
        // Receiving the email proves ownership of the address, so a pending account becomes active.
        const [user] = await tx
          .update(users)
          .set({
            passwordHash,
            failedLoginCount: 0,
            lockedUntil: null,
            emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${at})`,
            status: sql`case when ${users.status} = 'PENDING_VERIFICATION' then 'ACTIVE'::user_status else ${users.status} end`,
          })
          .where(eq(users.id, claimed.userId))
          .returning({ id: users.id, email: users.email, fullName: users.fullName });
        if (!user) return null;
        await revokeAllSessions(tx, user.id, undefined, at);
        await recordAudit(tx, { actorId: user.id, action: "user.password_reset", entityType: "user", entityId: user.id, ip: ctx.ip });
        return user;
      });
      if (!result) throw new InvalidTokenError();
      await deliver(passwordChangedMessage(result.email, result.fullName));
      return { ok: true };
    },

    async changePassword(
      userId: string,
      currentSessionId: string,
      input: { currentPassword: string; newPassword: string },
      ctx: RequestContext = {},
    ): Promise<{ ok: true }> {
      const newPassword = parseOrThrow(passwordSchema, input.newPassword);
      await enforceRateLimit(db, { key: `change-password:user:${userId}`, limit: 10, windowSeconds: 900 });
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || !user.passwordHash || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
        throw new InvalidCredentialsError();
      }
      const passwordHash = await hashPassword(newPassword);
      await db.transaction(async (tx) => {
        await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
        await revokeAllSessions(tx, userId, currentSessionId, now());
        await recordAudit(tx, { actorId: userId, action: "user.password_changed", entityType: "user", entityId: userId, ip: ctx.ip });
      });
      await deliver(passwordChangedMessage(user.email, user.fullName));
      return { ok: true };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
