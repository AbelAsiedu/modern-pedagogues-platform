import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  AccountSuspendedError,
  ConflictError,
  InvalidCodeError,
  InvalidCredentialsError,
  InvalidTokenError,
  MfaRequiredError,
} from "@/server/errors";
import { MFA_CHALLENGE_TTL_SECONDS, MFA_MAX_CHALLENGE_ATTEMPTS } from "@/server/auth/mfa";
import { validateSession } from "@/server/auth/sessions";
import { hashToken } from "@/server/auth/tokens";
import { totpCode } from "@/server/auth/totp";
import { auditLogs, mfaChallenges, mfaRecoveryCodes, sessions, userRoles, userMfa, users, roles } from "@/server/db/schema";
import { GOOD_PASSWORD, makeAuth, newUser, openTestDb, resetData } from "../support/harness";

const { pool, db } = openTestDb();
afterAll(() => pool.end());
beforeEach(() => resetData(db));

const EMAIL = "ama@example.com";
const step = (clock: { now: Date }, seconds = 30) => {
  clock.now = new Date(clock.now.getTime() + seconds * 1000);
};

async function setup(opts: { mfaKey?: Buffer | null } = {}) {
  const clock = { now: new Date() };
  const h = makeAuth(db, clock, opts);
  await h.auth.register(newUser(EMAIL));
  await h.auth.verifyEmail(h.tokenFromLast());
  const [u] = await db.select().from(users).where(eq(users.email, EMAIL));
  return { ...h, clock, userId: u!.id };
}

/** Sign in with the password only (a user with no two-step sign-in), returning the raw session token and its id. */
async function plainLogin(h: Awaited<ReturnType<typeof setup>>) {
  const r = await h.auth.login({ email: EMAIL, password: GOOD_PASSWORD });
  const v = await validateSession(db, r.token);
  return { token: r.token, sessionId: v!.sessionId };
}

/** Run the whole set-up and return what a person would hold afterwards: the seed (in their app) and the recovery codes. */
async function enrol(h: Awaited<ReturnType<typeof setup>>, sessionId: string) {
  await h.auth.mfa.beginSetup(h.userId);
  const pending = (await h.auth.mfa.pendingSetup(h.userId, EMAIL))!;
  const { recoveryCodes } = await h.auth.mfa.confirmSetup(h.userId, sessionId, totpCode(pending.secret, h.clock.now));
  return { secret: pending.secret, recoveryCodes };
}

/** Password step, returning the challenge the second step needs. */
async function challenge(h: Awaited<ReturnType<typeof setup>>): Promise<string> {
  try {
    await h.auth.login({ email: EMAIL, password: GOOD_PASSWORD });
  } catch (e) {
    if (e instanceof MfaRequiredError) return e.challenge;
    throw e;
  }
  throw new Error("expected the password step to ask for a code");
}

describe("setting up two-step sign-in", () => {
  it("stores the seed encrypted and the recovery codes hashed, and reports ten unused codes", async () => {
    const h = await setup();
    const { sessionId } = await plainLogin(h);
    expect(await h.auth.mfa.status(h.userId)).toEqual({ state: "off", recoveryRemaining: 0 });
    await h.auth.mfa.beginSetup(h.userId);
    expect((await h.auth.mfa.status(h.userId)).state).toBe("pending");
    const pending = (await h.auth.mfa.pendingSetup(h.userId, EMAIL))!;
    expect(pending.uri).toContain(`secret=${pending.secret}`);
    expect(pending.uri).toContain("The%20Modern%20Pedagogues");

    const { recoveryCodes } = await h.auth.mfa.confirmSetup(h.userId, sessionId, totpCode(pending.secret, h.clock.now));
    expect(recoveryCodes).toHaveLength(10);
    expect(await h.auth.mfa.status(h.userId)).toEqual({ state: "on", recoveryRemaining: 10 });

    const [row] = await db.select().from(userMfa);
    expect(row!.secretEnc).toMatch(/^v1\./);
    expect(row!.secretEnc).not.toContain(pending.secret);
    const hashes = (await db.select().from(mfaRecoveryCodes)).map((r) => r.codeHash);
    expect(hashes).toContain(hashToken(recoveryCodes[0]!));
    for (const c of recoveryCodes) expect(hashes).not.toContain(c);
  });

  it("refuses a wrong code and stays in the pending state, so nothing is enforced yet", async () => {
    const h = await setup();
    const { sessionId } = await plainLogin(h);
    await h.auth.mfa.beginSetup(h.userId);
    await expect(h.auth.mfa.confirmSetup(h.userId, sessionId, "000000")).rejects.toBeInstanceOf(InvalidCodeError);
    await expect(h.auth.mfa.confirmSetup(h.userId, sessionId, "abcdef")).rejects.toBeInstanceOf(InvalidCodeError);
    expect(await h.auth.mfa.isEnabledFor(h.userId)).toBe(false);
    // Password-only sign-in still works because setup was never completed.
    await expect(h.auth.login({ email: EMAIL, password: GOOD_PASSWORD })).resolves.toMatchObject({ userId: h.userId });
  });

  it("signs out every other session when it is switched on, but not the one doing the set-up", async () => {
    const h = await setup();
    const mine = await plainLogin(h);
    const other = await plainLogin(h);
    await enrol(h, mine.sessionId);
    expect(await validateSession(db, mine.token)).not.toBeNull();
    expect(await validateSession(db, other.token)).toBeNull();
  });

  it("will not start again once it is on", async () => {
    const h = await setup();
    const { sessionId } = await plainLogin(h);
    await enrol(h, sessionId);
    await expect(h.auth.mfa.beginSetup(h.userId)).rejects.toBeInstanceOf(ConflictError);
  });

  it("is unavailable without a server key", async () => {
    const noKey = await setup({ mfaKey: null });
    expect(noKey.auth.mfa.available()).toBe(false);
    await expect(noKey.auth.mfa.beginSetup(noKey.userId)).rejects.toBeInstanceOf(ConflictError);
  });

  it("restarting set-up gives a new seed, and the old one no longer confirms", async () => {
    const h = await setup();
    const { sessionId } = await plainLogin(h);
    await h.auth.mfa.beginSetup(h.userId);
    const first = (await h.auth.mfa.pendingSetup(h.userId, EMAIL))!;
    await h.auth.mfa.beginSetup(h.userId);
    const second = (await h.auth.mfa.pendingSetup(h.userId, EMAIL))!;
    expect(second.secret).not.toBe(first.secret);
    await expect(h.auth.mfa.confirmSetup(h.userId, sessionId, totpCode(first.secret, h.clock.now))).rejects.toBeInstanceOf(InvalidCodeError);
    await expect(h.auth.mfa.confirmSetup(h.userId, sessionId, totpCode(second.secret, h.clock.now))).resolves.toBeTruthy();
  });
});

describe("signing in with two-step sign-in on", () => {
  it("never gives a session for the password alone; it hands over a ticket instead", async () => {
    const h = await setup();
    const { sessionId } = await plainLogin(h);
    await enrol(h, sessionId);
    const before = (await db.select().from(sessions)).length;
    const ticket = await challenge(h);
    expect(ticket.length).toBeGreaterThan(30);
    expect((await db.select().from(sessions)).length).toBe(before); // no new session
    const [row] = await db.select().from(mfaChallenges);
    expect(row!.tokenHash).toBe(hashToken(ticket)); // stored hashed
    expect(row!.tokenHash).not.toBe(ticket);
  });

  it("a wrong password gets the usual error and no ticket", async () => {
    const h = await setup();
    const { sessionId } = await plainLogin(h);
    await enrol(h, sessionId);
    await expect(h.auth.login({ email: EMAIL, password: "wrong password here" })).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(await db.select().from(mfaChallenges)).toHaveLength(0);
  });

  it("the right code turns the ticket into a session, once", async () => {
    const h = await setup();
    const { sessionId } = await plainLogin(h);
    const { secret } = await enrol(h, sessionId);
    const ticket = await challenge(h);
    step(h.clock); // the set-up used this step's code; a new step's code is needed
    const done = await h.auth.mfa.completeLogin(ticket, totpCode(secret, h.clock.now));
    expect(done.userId).toBe(h.userId);
    expect(await validateSession(db, done.token)).not.toBeNull();
    // The ticket is spent.
    await expect(h.auth.mfa.completeLogin(ticket, totpCode(secret, h.clock.now))).rejects.toBeInstanceOf(InvalidTokenError);
    const actions = (await db.select().from(auditLogs)).map((a) => a.action);
    expect(actions).toContain("user.mfa_enabled");
    expect(actions.filter((a) => a === "user.login").length).toBeGreaterThanOrEqual(2);
  });

  it("refuses a code that was already used, even for a fresh ticket (no replay)", async () => {
    const h = await setup();
    const { sessionId } = await plainLogin(h);
    const { secret } = await enrol(h, sessionId);
    step(h.clock);
    const code = totpCode(secret, h.clock.now);
    await h.auth.mfa.completeLogin(await challenge(h), code);
    const second = await challenge(h);
    await expect(h.auth.mfa.completeLogin(second, code)).rejects.toBeInstanceOf(InvalidCodeError);
    // The code from the set-up step (an older step) is refused too.
    await expect(h.auth.mfa.completeLogin(second, totpCode(secret, new Date(h.clock.now.getTime() - 30_000)))).rejects.toBeInstanceOf(InvalidCodeError);
  });

  it("two simultaneous attempts with the same correct code let exactly one in", async () => {
    const h = await setup();
    const { sessionId } = await plainLogin(h);
    const { secret } = await enrol(h, sessionId);
    step(h.clock);
    const code = totpCode(secret, h.clock.now);
    const a = await challenge(h);
    const b = await challenge(h).catch(() => null); // the second ticket replaces the first
    const tickets = [a, b].filter((t): t is string => Boolean(t));
    const results = await Promise.allSettled(tickets.map((t) => h.auth.mfa.completeLogin(t, code)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("destroys the ticket after five wrong codes, so even the right code then fails", async () => {
    const h = await setup();
    const { sessionId } = await plainLogin(h);
    const { secret } = await enrol(h, sessionId);
    step(h.clock);
    const ticket = await challenge(h);
    for (let i = 0; i < MFA_MAX_CHALLENGE_ATTEMPTS; i++) {
      await expect(h.auth.mfa.completeLogin(ticket, "000000")).rejects.toBeInstanceOf(InvalidCodeError);
    }
    expect(await db.select().from(mfaChallenges)).toHaveLength(0);
    await expect(h.auth.mfa.completeLogin(ticket, totpCode(secret, h.clock.now))).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("a ticket expires after five minutes", async () => {
    const h = await setup();
    const { sessionId } = await plainLogin(h);
    const { secret } = await enrol(h, sessionId);
    const ticket = await challenge(h);
    step(h.clock, MFA_CHALLENGE_TTL_SECONDS + 31);
    await expect(h.auth.mfa.completeLogin(ticket, totpCode(secret, h.clock.now))).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("an unknown or empty ticket is refused without touching anything", async () => {
    const h = await setup();
    await expect(h.auth.mfa.completeLogin("not-a-ticket", "123456")).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(h.auth.mfa.completeLogin("", "123456")).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("a suspended account cannot finish signing in", async () => {
    const h = await setup();
    const { sessionId } = await plainLogin(h);
    const { secret } = await enrol(h, sessionId);
    const ticket = await challenge(h);
    step(h.clock);
    await db.update(users).set({ status: "SUSPENDED" }).where(eq(users.id, h.userId));
    await expect(h.auth.mfa.completeLogin(ticket, totpCode(secret, h.clock.now))).rejects.toBeInstanceOf(AccountSuspendedError);
  });

  it("a new password step replaces the earlier ticket", async () => {
    const h = await setup();
    const { sessionId } = await plainLogin(h);
    const { secret } = await enrol(h, sessionId);
    const first = await challenge(h);
    const second = await challenge(h);
    step(h.clock);
    await expect(h.auth.mfa.completeLogin(first, totpCode(secret, h.clock.now))).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(h.auth.mfa.completeLogin(second, totpCode(secret, h.clock.now))).resolves.toBeTruthy();
  });
});

describe("recovery codes", () => {
  it("each works once, in any case and spacing, and the audit log records the use", async () => {
    const h = await setup();
    const { sessionId } = await plainLogin(h);
    const { recoveryCodes } = await enrol(h, sessionId);
    const code = recoveryCodes[0]!;
    const done = await h.auth.mfa.completeLogin(await challenge(h), ` ${code.toLowerCase().replace("-", " ")} `);
    expect(await validateSession(db, done.token)).not.toBeNull();
    await expect(h.auth.mfa.completeLogin(await challenge(h), code)).rejects.toBeInstanceOf(InvalidCodeError);
    expect(await h.auth.mfa.status(h.userId)).toEqual({ state: "on", recoveryRemaining: 9 });
    const used = (await db.select().from(auditLogs)).find((a) => a.action === "user.mfa_recovery_used");
    expect(used?.metadata).toEqual({ remaining: 9 });
    // The log never holds the code itself.
    expect(JSON.stringify(await db.select().from(auditLogs))).not.toContain(code);
  });

  it("still work when the server key has been lost, because they do not need the seed", async () => {
    const h = await setup();
    const { sessionId } = await plainLogin(h);
    const { secret, recoveryCodes } = await enrol(h, sessionId);
    const lost = makeAuth(db, h.clock, { mfaKey: Buffer.alloc(32, 99) });
    const ticket = await (async () => {
      try {
        await lost.auth.login({ email: EMAIL, password: GOOD_PASSWORD });
      } catch (e) {
        if (e instanceof MfaRequiredError) return e.challenge;
      }
      throw new Error("no ticket");
    })();
    step(h.clock);
    await expect(lost.auth.mfa.completeLogin(ticket, totpCode(secret, h.clock.now))).rejects.toBeInstanceOf(InvalidCodeError);
    await expect(lost.auth.mfa.completeLogin(ticket, recoveryCodes[1]!)).resolves.toBeTruthy();
  });

  it("making new ones kills the old ones and needs the password and a code", async () => {
    const h = await setup();
    const { sessionId } = await plainLogin(h);
    const { secret, recoveryCodes } = await enrol(h, sessionId);
    step(h.clock);
    const code = totpCode(secret, h.clock.now);
    await expect(h.auth.mfa.regenerateRecoveryCodes(h.userId, { password: "wrong password here", code })).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(h.auth.mfa.regenerateRecoveryCodes(h.userId, { password: GOOD_PASSWORD, code: "000000" })).rejects.toBeInstanceOf(InvalidCodeError);
    const fresh = await h.auth.mfa.regenerateRecoveryCodes(h.userId, { password: GOOD_PASSWORD, code });
    expect(fresh.recoveryCodes).toHaveLength(10);
    await expect(h.auth.mfa.completeLogin(await challenge(h), recoveryCodes[0]!)).rejects.toBeInstanceOf(InvalidCodeError);
    await expect(h.auth.mfa.completeLogin(await challenge(h), fresh.recoveryCodes[0]!)).resolves.toBeTruthy();
  });
});

describe("turning it off, and the owner's reset", () => {
  it("needs the password and a current code; afterwards the password alone signs in, and other sessions end", async () => {
    const h = await setup();
    const mine = await plainLogin(h);
    const { secret } = await enrol(h, mine.sessionId);
    const ticket = await challenge(h);
    step(h.clock);
    const other = await h.auth.mfa.completeLogin(ticket, totpCode(secret, h.clock.now));
    step(h.clock);
    const code = totpCode(secret, h.clock.now);
    await expect(h.auth.mfa.disable(h.userId, mine.sessionId, { password: "wrong password here", code })).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(h.auth.mfa.disable(h.userId, mine.sessionId, { password: GOOD_PASSWORD, code: "111111" })).rejects.toBeInstanceOf(InvalidCodeError);
    expect(await h.auth.mfa.isEnabledFor(h.userId)).toBe(true);

    await h.auth.mfa.disable(h.userId, mine.sessionId, { password: GOOD_PASSWORD, code });
    expect(await h.auth.mfa.status(h.userId)).toEqual({ state: "off", recoveryRemaining: 0 });
    expect(await db.select().from(userMfa)).toHaveLength(0);
    expect(await validateSession(db, other.token)).toBeNull();
    await expect(h.auth.login({ email: EMAIL, password: GOOD_PASSWORD })).resolves.toMatchObject({ userId: h.userId });
    expect((await db.select().from(auditLogs)).map((a) => a.action)).toContain("user.mfa_disabled");
  });

  it("a recovery code is accepted as the proof when turning it off", async () => {
    const h = await setup();
    const { sessionId } = await plainLogin(h);
    const { recoveryCodes } = await enrol(h, sessionId);
    await h.auth.mfa.disable(h.userId, sessionId, { password: GOOD_PASSWORD, code: recoveryCodes[0]! });
    expect(await h.auth.mfa.isEnabledFor(h.userId)).toBe(false);
  });

  it("the owner's reset removes it without a code, ends every session, and is audited", async () => {
    const h = await setup();
    const mine = await plainLogin(h);
    await enrol(h, mine.sessionId);
    await h.auth.mfa.reset(h.userId, "cli");
    expect(await h.auth.mfa.isEnabledFor(h.userId)).toBe(false);
    expect(await validateSession(db, mine.token)).toBeNull();
    expect(await db.select().from(mfaRecoveryCodes)).toHaveLength(0);
    const entry = (await db.select().from(auditLogs)).find((a) => a.action === "user.mfa_reset");
    expect(entry?.metadata).toEqual({ via: "cli" });
    await expect(h.auth.login({ email: EMAIL, password: GOOD_PASSWORD })).resolves.toBeTruthy();
  });

  it("a password reset does not switch two-step sign-in off", async () => {
    const h = await setup();
    const { sessionId } = await plainLogin(h);
    await enrol(h, sessionId);
    await h.auth.requestPasswordReset(EMAIL);
    await h.auth.resetPassword(h.tokenFromLast(), "a brand new passphrase 123");
    await expect(h.auth.login({ email: EMAIL, password: "a brand new passphrase 123" })).rejects.toBeInstanceOf(MfaRequiredError);
  });
});

describe("staff must use two-step sign-in", () => {
  async function staffUser(roleKey: "admin" | "parent" | "super_admin") {
    const h = await setup();
    const [r] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, roleKey));
    await db.delete(userRoles).where(eq(userRoles.userId, h.userId));
    await db.insert(userRoles).values({ userId: h.userId, roleId: r!.id });
    return h;
  }

  it("withholds staff roles until two-step sign-in is set up, when the site requires it", async () => {
    const h = await staffUser("admin");
    const { token, sessionId } = await plainLogin(h);
    const enforced = await validateSession(db, token, new Date(), { requireStaffTwoStep: true });
    expect(enforced?.mfaSetupRequired).toBe(true);
    expect(enforced?.actor.roles).toEqual([]); // no permission anywhere, not just on the admin pages

    const notEnforced = await validateSession(db, token, new Date(), { requireStaffTwoStep: false });
    expect(notEnforced?.mfaSetupRequired).toBe(false);
    expect(notEnforced?.actor.roles).toEqual(["admin"]);

    await enrol(h, sessionId);
    const after = await validateSession(db, token, new Date(), { requireStaffTwoStep: true });
    expect(after?.mfaSetupRequired).toBe(false);
    expect(after?.actor.roles).toEqual(["admin"]);
  });

  it("applies to super administrators too, and lifts again if two-step sign-in is reset (then they set it up again)", async () => {
    const h = await staffUser("super_admin");
    const { token, sessionId } = await plainLogin(h);
    await enrol(h, sessionId);
    expect((await validateSession(db, token, new Date(), { requireStaffTwoStep: true }))?.actor.roles).toEqual(["super_admin"]);
    await h.auth.mfa.reset(h.userId, "cli");
    const again = await plainLogin(h);
    expect((await validateSession(db, again.token, new Date(), { requireStaffTwoStep: true }))?.mfaSetupRequired).toBe(true);
  });

  it("leaves parents and students alone", async () => {
    const h = await staffUser("parent");
    const { token } = await plainLogin(h);
    const v = await validateSession(db, token, new Date(), { requireStaffTwoStep: true });
    expect(v?.mfaSetupRequired).toBe(false);
    expect(v?.actor.roles).toEqual(["parent"]);
  });

  it("an unconfirmed set-up does not count", async () => {
    const h = await staffUser("admin");
    const { token } = await plainLogin(h);
    await h.auth.mfa.beginSetup(h.userId);
    expect((await validateSession(db, token, new Date(), { requireStaffTwoStep: true }))?.mfaSetupRequired).toBe(true);
    expect(await db.select().from(sessions).where(and(eq(sessions.userId, h.userId), isNull(sessions.revokedAt)))).not.toHaveLength(0);
  });
});
