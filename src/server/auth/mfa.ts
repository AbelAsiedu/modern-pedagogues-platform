import { and, count, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "../db";
import { mfaChallenges, mfaRecoveryCodes, userMfa, users } from "../db/schema";
import { recordAudit } from "../audit";
import {
  AccountLockedError,
  AccountSuspendedError,
  ConflictError,
  InvalidCodeError,
  InvalidCredentialsError,
  InvalidTokenError,
  RateLimitError,
} from "../errors";
import type { Logger } from "../logger";
import { verifyPassword } from "./password";
import { enforceRateLimit } from "./rate-limit";
import { decryptSecret, encryptSecret } from "./secret-box";
import { createSession, revokeAllSessions } from "./sessions";
import { generateToken, hashToken } from "./tokens";
import {
  RECOVERY_CODE_COUNT,
  generateRecoveryCode,
  generateTotpSecret,
  otpauthUri,
  parseSecondFactor,
  verifyTotp,
  type ParsedCode,
} from "./totp";

export const MFA_CHALLENGE_TTL_SECONDS = 5 * 60;
export const MFA_MAX_CHALLENGE_ATTEMPTS = 5;
export const MFA_ISSUER = "The Modern Pedagogues";

export type MfaDeps = {
  db: Db;
  log: Logger;
  /** The 32-byte key that encrypts authenticator seeds. Null when the site has not been given one. */
  key: Buffer | null;
  now?: () => Date;
};

export type MfaContext = { ip?: string | null; userAgent?: string | null };
export type MfaState = "off" | "pending" | "on";

export function createMfaService(deps: MfaDeps) {
  const { db, log, key } = deps;
  const now = () => (deps.now ? deps.now() : new Date());
  const ipKey = (ctx: MfaContext) => ctx.ip ?? "unknown";

  const requireKey = (): Buffer => {
    if (!key) throw new ConflictError("Two-step sign-in has not been switched on for this site yet. Ask the site owner to finish its setup.");
    return key;
  };

  async function confirmedRow(tx: DbOrTx, userId: string) {
    const [row] = await tx.select().from(userMfa).where(and(eq(userMfa.userId, userId), isNotNull(userMfa.confirmedAt))).limit(1);
    return row;
  }

  /**
   * Check one code for one user and burn it. A six-digit code is accepted once per 30-second step; a recovery code
   * once ever. Both burns are single conditional UPDATEs, so two simultaneous attempts cannot both succeed.
   */
  async function consumeFactor(
    userId: string,
    parsed: ParsedCode,
    at: Date,
    opts: { allowRecovery: boolean; requireConfirmed: boolean },
  ): Promise<"totp" | "recovery" | null> {
    if (!parsed) return null;
    if (parsed.kind === "recovery") {
      if (!opts.allowRecovery) return null;
      const burned = await db
        .update(mfaRecoveryCodes)
        .set({ usedAt: at })
        .where(and(eq(mfaRecoveryCodes.userId, userId), eq(mfaRecoveryCodes.codeHash, hashToken(parsed.code)), isNull(mfaRecoveryCodes.usedAt)))
        .returning({ id: mfaRecoveryCodes.id });
      return burned.length > 0 ? "recovery" : null;
    }
    const [row] = await db.select().from(userMfa).where(eq(userMfa.userId, userId)).limit(1);
    if (!row || (opts.requireConfirmed && !row.confirmedAt)) return null;
    if (!key) return null;
    const secret = decryptSecret(key, row.secretEnc);
    if (!secret) {
      log.error({ userId }, "could not decrypt an authenticator seed; has MFA_ENCRYPTION_KEY changed?");
      return null;
    }
    const step = verifyTotp(secret, parsed.code, at, row.lastStep);
    if (step === null) return null;
    const claimed = await db
      .update(userMfa)
      .set({ lastStep: step })
      .where(and(eq(userMfa.userId, userId), or(isNull(userMfa.lastStep), lt(userMfa.lastStep, step))))
      .returning({ userId: userMfa.userId });
    return claimed.length > 0 ? "totp" : null;
  }

  async function newRecoveryCodes(tx: DbOrTx, userId: string): Promise<string[]> {
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
    await tx.insert(mfaRecoveryCodes).values(codes.map((c) => ({ userId, codeHash: hashToken(c) })));
    return codes;
  }

  /** Password plus a current code: the proof asked for before anything that weakens or replaces two-step sign-in. */
  async function proveIdentity(userId: string, input: { password: string; code: string }, at: Date, ctx: MfaContext) {
    await enforceRateLimit(db, { key: `mfa-manage:user:${userId}`, limit: 10, windowSeconds: 900 });
    const [user] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.hash || !(await verifyPassword(user.hash, input.password))) throw new InvalidCredentialsError();
    const used = await consumeFactor(userId, parseSecondFactor(input.code), at, { allowRecovery: true, requireConfirmed: true });
    if (!used) {
      await recordAudit(db, { actorId: userId, action: "user.mfa_code_refused", entityType: "user", entityId: userId, ip: ctx.ip });
      throw new InvalidCodeError();
    }
    return used;
  }

  async function status(userId: string): Promise<{ state: MfaState; recoveryRemaining: number }> {
    const [row] = await db.select({ confirmedAt: userMfa.confirmedAt }).from(userMfa).where(eq(userMfa.userId, userId)).limit(1);
    if (!row) return { state: "off", recoveryRemaining: 0 };
    if (!row.confirmedAt) return { state: "pending", recoveryRemaining: 0 };
    const [r] = await db
      .select({ n: count() })
      .from(mfaRecoveryCodes)
      .where(and(eq(mfaRecoveryCodes.userId, userId), isNull(mfaRecoveryCodes.usedAt)));
    return { state: "on", recoveryRemaining: r?.n ?? 0 };
  }

  return {
    /** True when this site has been given an encryption key, so two-step sign-in can be offered. */
    available: (): boolean => key !== null,

    async isEnabledFor(userId: string): Promise<boolean> {
      return Boolean(await confirmedRow(db, userId));
    },

    status,

    /** Start (or restart) setup: a fresh seed, not yet enforced. Refused when two-step sign-in is already on. */
    async beginSetup(userId: string): Promise<void> {
      const k = requireKey();
      if (await confirmedRow(db, userId)) throw new ConflictError("Two-step sign-in is already switched on for your account.");
      const secretEnc = encryptSecret(k, generateTotpSecret());
      await db
        .insert(userMfa)
        .values({ userId, secretEnc })
        .onConflictDoUpdate({ target: userMfa.userId, set: { secretEnc, confirmedAt: null, lastStep: null, createdAt: now() } });
    },

    /** What the setup page shows: the seed and the address the QR code carries. Null when setup has not been started. */
    async pendingSetup(userId: string, email: string): Promise<{ secret: string; uri: string } | null> {
      if (!key) return null;
      const [row] = await db.select().from(userMfa).where(and(eq(userMfa.userId, userId), isNull(userMfa.confirmedAt))).limit(1);
      if (!row) return null;
      const secret = decryptSecret(key, row.secretEnc);
      return secret ? { secret, uri: otpauthUri(MFA_ISSUER, email, secret) } : null;
    },

    /** The user proves their app works. Switches two-step sign-in on and returns the recovery codes, shown once. */
    async confirmSetup(userId: string, currentSessionId: string, rawCode: string, ctx: MfaContext = {}): Promise<{ recoveryCodes: string[] }> {
      requireKey();
      await enforceRateLimit(db, { key: `mfa-setup:user:${userId}`, limit: 10, windowSeconds: 900 });
      const at = now();
      const [row] = await db.select().from(userMfa).where(eq(userMfa.userId, userId)).limit(1);
      if (!row || row.confirmedAt) throw new ConflictError("There is no setup in progress. Start again from the beginning.");
      const parsed = parseSecondFactor(rawCode);
      const secret = decryptSecret(key!, row.secretEnc);
      const step = secret && parsed?.kind === "totp" ? verifyTotp(secret, parsed.code, at, null) : null;
      if (step === null) throw new InvalidCodeError("That code did not match. Check that you scanned the code for this site, and use the 6 digits your app shows right now.");
      return db.transaction(async (tx) => {
        const claimed = await tx
          .update(userMfa)
          .set({ confirmedAt: at, lastStep: step })
          .where(and(eq(userMfa.userId, userId), isNull(userMfa.confirmedAt)))
          .returning({ userId: userMfa.userId });
        if (claimed.length === 0) throw new ConflictError("Two-step sign-in was already switched on.");
        const recoveryCodes = await newRecoveryCodes(tx, userId);
        // Anyone already signed in as this person without the code (a stolen session, say) is signed out.
        await revokeAllSessions(tx, userId, currentSessionId, at);
        await recordAudit(tx, { actorId: userId, action: "user.mfa_enabled", entityType: "user", entityId: userId, ip: ctx.ip });
        return { recoveryCodes };
      });
    },

    async disable(userId: string, currentSessionId: string, input: { password: string; code: string }, ctx: MfaContext = {}): Promise<void> {
      const at = now();
      await proveIdentity(userId, input, at, ctx);
      await db.transaction(async (tx) => {
        await tx.delete(userMfa).where(eq(userMfa.userId, userId));
        await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
        await tx.delete(mfaChallenges).where(eq(mfaChallenges.userId, userId));
        await revokeAllSessions(tx, userId, currentSessionId, at);
        await recordAudit(tx, { actorId: userId, action: "user.mfa_disabled", entityType: "user", entityId: userId, ip: ctx.ip });
      });
    },

    async regenerateRecoveryCodes(userId: string, input: { password: string; code: string }, ctx: MfaContext = {}): Promise<{ recoveryCodes: string[] }> {
      const at = now();
      await proveIdentity(userId, input, at, ctx);
      return db.transaction(async (tx) => {
        const recoveryCodes = await newRecoveryCodes(tx, userId);
        await recordAudit(tx, { actorId: userId, action: "user.mfa_recovery_regenerated", entityType: "user", entityId: userId, ip: ctx.ip });
        return { recoveryCodes };
      });
    },

    /** Used by login() once the password was right: a single-use, five-minute ticket for the second step. */
    async createChallenge(userId: string): Promise<string> {
      const at = now();
      const token = generateToken();
      await db.transaction(async (tx) => {
        await tx.delete(mfaChallenges).where(or(eq(mfaChallenges.userId, userId), lt(mfaChallenges.expiresAt, at)));
        await tx.insert(mfaChallenges).values({
          userId,
          tokenHash: hashToken(token),
          expiresAt: new Date(at.getTime() + MFA_CHALLENGE_TTL_SECONDS * 1000),
        });
      });
      return token;
    },

    /** The second sign-in step. On success this is where the session is created. */
    async completeLogin(challengeToken: string, rawCode: string, ctx: MfaContext = {}): Promise<{ token: string; expiresAt: Date; userId: string }> {
      const at = now();
      try {
        await enforceRateLimit(db, { key: `mfa:ip:${ipKey(ctx)}`, limit: 40, windowSeconds: 600 });
      } catch (err) {
        if (err instanceof RateLimitError) throw new AccountLockedError(err.retryAfterSeconds);
        throw err;
      }
      if (!challengeToken || challengeToken.length > 200) throw new InvalidTokenError();
      const tokenHash = hashToken(challengeToken);
      const [challenge] = await db
        .select()
        .from(mfaChallenges)
        .where(and(eq(mfaChallenges.tokenHash, tokenHash), gt(mfaChallenges.expiresAt, at)))
        .limit(1);
      if (!challenge) throw new InvalidTokenError();
      const userId = challenge.userId;
      try {
        await enforceRateLimit(db, { key: `mfa:user:${userId}`, limit: 10, windowSeconds: 900 });
      } catch (err) {
        if (err instanceof RateLimitError) throw new AccountLockedError(err.retryAfterSeconds);
        throw err;
      }

      // Every try is counted before the code is looked at; the fifth wrong one destroys the ticket.
      const [counted] = await db
        .update(mfaChallenges)
        .set({ attempts: sql`${mfaChallenges.attempts} + 1` })
        .where(and(eq(mfaChallenges.id, challenge.id), lt(mfaChallenges.attempts, MFA_MAX_CHALLENGE_ATTEMPTS)))
        .returning({ attempts: mfaChallenges.attempts });
      if (!counted) {
        await db.delete(mfaChallenges).where(eq(mfaChallenges.id, challenge.id));
        throw new InvalidTokenError();
      }

      const used = await consumeFactor(userId, parseSecondFactor(rawCode), at, { allowRecovery: true, requireConfirmed: true });
      if (!used) {
        await recordAudit(db, { actorId: userId, action: "user.mfa_code_refused", entityType: "user", entityId: userId, ip: ctx.ip });
        if (counted.attempts >= MFA_MAX_CHALLENGE_ATTEMPTS) await db.delete(mfaChallenges).where(eq(mfaChallenges.id, challenge.id));
        throw new InvalidCodeError();
      }

      // Single use: whoever deletes the ticket first is the one who signs in.
      const spent = await db.delete(mfaChallenges).where(eq(mfaChallenges.id, challenge.id)).returning({ id: mfaChallenges.id });
      if (spent.length === 0) throw new InvalidTokenError();

      const [user] = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
      if (!user) throw new InvalidTokenError();
      if (user.status === "SUSPENDED") throw new AccountSuspendedError();
      if (user.status !== "ACTIVE") throw new InvalidTokenError();

      await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: at }).where(eq(users.id, userId));
      const session = await createSession(db, userId, { ...ctx, now: at });
      await recordAudit(db, { actorId: userId, action: "user.login", entityType: "user", entityId: userId, metadata: { twoStep: used }, ip: ctx.ip });
      if (used === "recovery") {
        const remaining = (await status(userId)).recoveryRemaining;
        await recordAudit(db, { actorId: userId, action: "user.mfa_recovery_used", entityType: "user", entityId: userId, metadata: { remaining }, ip: ctx.ip });
      }
      return { token: session.token, expiresAt: session.expiresAt, userId };
    },

    /**
     * Switch two-step sign-in off for someone who lost both their phone and their recovery codes.
     * Not reachable from the website: it is run by the site owner with `npm run admin:reset-mfa`.
     */
    async reset(userId: string, via: string): Promise<void> {
      const at = now();
      await db.transaction(async (tx) => {
        await tx.delete(mfaChallenges).where(eq(mfaChallenges.userId, userId));
        await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
        await tx.delete(userMfa).where(eq(userMfa.userId, userId));
        await revokeAllSessions(tx, userId, undefined, at);
        await recordAudit(tx, { action: "user.mfa_reset", entityType: "user", entityId: userId, metadata: { via } });
      });
    },
  };
}

export type MfaService = ReturnType<typeof createMfaService>;
