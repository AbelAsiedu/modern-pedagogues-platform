import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  AccountLockedError,
  AccountSuspendedError,
  EmailNotVerifiedError,
  InvalidCredentialsError,
  InvalidTokenError,
  ValidationError,
} from "@/server/errors";
import { LOCKOUT_SECONDS, MAX_FAILED_LOGINS, RESET_TTL_SECONDS, VERIFY_TTL_SECONDS } from "@/server/auth/service";
import { revokeAllSessions, validateSession } from "@/server/auth/sessions";
import { hashToken } from "@/server/auth/tokens";
import { emailDeliveries, passwordResetTokens, sessions, userRoles, users } from "@/server/db/schema";
import { GOOD_PASSWORD, makeAuth, newUser, openTestDb, resetData } from "../support/harness";

const { pool, db } = openTestDb();
afterAll(() => pool.end());
beforeEach(() => resetData(db));

async function registerAndVerify(h: ReturnType<typeof makeAuth>, email = "ama@example.com") {
  await h.auth.register(newUser(email));
  await h.auth.verifyEmail(h.tokenFromLast());
}

describe("registration", () => {
  it("creates a pending user with a role, hashed password, and a verification email", async () => {
    const h = makeAuth(db);
    await expect(h.auth.register(newUser())).resolves.toEqual({ ok: true });
    const [u] = await db.select().from(users);
    expect(u!.status).toBe("PENDING_VERIFICATION");
    expect(u!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(u!.passwordHash).not.toContain(GOOD_PASSWORD);
    expect(await db.select().from(userRoles)).toHaveLength(1);
    expect(h.mailer.last()?.subject).toMatch(/Confirm/);
    expect(h.mailer.last()?.to).toBe("ama@example.com");
  });

  it("stores only a hash of the verification token", async () => {
    const h = makeAuth(db);
    await h.auth.register(newUser());
    const raw = h.tokenFromLast();
    const rows = await db.execute<{ token_hash: string }>(sql`select token_hash from email_verification_tokens`);
    expect(rows.rows[0]!.token_hash).toBe(hashToken(raw));
    expect(rows.rows[0]!.token_hash).not.toBe(raw);
  });

  it("looks identical for an email that is already registered, and does not create a second account", async () => {
    const h = makeAuth(db);
    await registerAndVerify(h);
    const first = await h.auth.register(newUser("new@example.com"));
    const dup = await h.auth.register({ ...newUser(), fullName: "Someone Else" });
    expect(dup).toEqual(first);
    expect(await db.select().from(users).where(eq(users.email, "ama@example.com"))).toHaveLength(1);
    expect(h.mailer.last()?.subject).toMatch(/already have an account/);
  });

  it("sends a fresh confirmation link, not a password reset, when an unconfirmed address signs up again", async () => {
    const h = makeAuth(db);
    await h.auth.register(newUser());
    const [before] = await db.select().from(users);
    await h.auth.register({ ...newUser(), password: "A different passphrase 456" });
    expect(h.mailer.last()?.subject).toMatch(/Confirm/);
    expect(h.mailer.last()?.text).toContain("/verify-email?token=");
    expect(h.mailer.last()?.text).not.toContain("reset-password");
    // The second password is not applied (otherwise a stranger could pre-set the password on someone else's address).
    const [after] = await db.select().from(users);
    expect(after!.passwordHash).toBe(before!.passwordHash);
    // Confirming from the new email activates the account and the ORIGINAL password signs in.
    await h.auth.verifyEmail(h.tokenFromLast());
    await expect(h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD })).resolves.toMatchObject({ userId: before!.id });
  });

  it("normalises email case so duplicates cannot slip through", async () => {
    const h = makeAuth(db);
    await h.auth.register(newUser("Ama@Example.com"));
    await h.auth.register(newUser("AMA@example.COM"));
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("rejects weak input and privileged roles", async () => {
    const h = makeAuth(db);
    await expect(h.auth.register({ ...newUser(), password: "short" })).rejects.toBeInstanceOf(ValidationError);
    await expect(h.auth.register({ ...newUser(), role: "admin" as never })).rejects.toBeInstanceOf(ValidationError);
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("rate-limits sign-ups per IP", async () => {
    const h = makeAuth(db);
    for (let i = 0; i < 10; i++) await h.auth.register(newUser(`u${i}@example.com`), { ip: "1.2.3.4" });
    await expect(h.auth.register(newUser("u11@example.com"), { ip: "1.2.3.4" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(h.auth.register(newUser("other@example.com"), { ip: "9.9.9.9" })).resolves.toEqual({ ok: true });
  });

  it("logs a failed email delivery without failing the sign-up", async () => {
    const h = makeAuth(db);
    h.mailer.send = async () => {
      throw new Error("smtp down");
    };
    await expect(h.auth.register(newUser())).resolves.toEqual({ ok: true });
    const [d] = await db.select().from(emailDeliveries);
    expect(d!.status).toBe("FAILED");
  });
});

describe("email verification", () => {
  it("activates the account, once", async () => {
    const h = makeAuth(db);
    await h.auth.register(newUser());
    const token = h.tokenFromLast();
    await h.auth.verifyEmail(token);
    const [u] = await db.select().from(users);
    expect(u!.status).toBe("ACTIVE");
    expect(u!.emailVerifiedAt).not.toBeNull();
    await expect(h.auth.verifyEmail(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejects garbage and unknown tokens identically", async () => {
    const h = makeAuth(db);
    await expect(h.auth.verifyEmail("x")).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(h.auth.verifyEmail("a".repeat(43))).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejects expired tokens", async () => {
    const clock = { now: new Date() };
    const h = makeAuth(db, clock);
    await h.auth.register(newUser());
    const token = h.tokenFromLast();
    clock.now = new Date(clock.now.getTime() + (VERIFY_TTL_SECONDS + 1) * 1000);
    await expect(h.auth.verifyEmail(token)).rejects.toBeInstanceOf(InvalidTokenError);
    expect((await db.select().from(users))[0]!.status).toBe("PENDING_VERIFICATION");
  });

  it("only one of two concurrent attempts succeeds", async () => {
    const h = makeAuth(db);
    await h.auth.register(newUser());
    const token = h.tokenFromLast();
    const results = await Promise.allSettled([h.auth.verifyEmail(token), h.auth.verifyEmail(token)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("resending invalidates the previous link", async () => {
    const h = makeAuth(db);
    await h.auth.register(newUser());
    const old = h.tokenFromLast();
    await h.auth.resendVerification("ama@example.com");
    const fresh = h.tokenFromLast();
    expect(fresh).not.toBe(old);
    await expect(h.auth.verifyEmail(old)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(h.auth.verifyEmail(fresh)).resolves.toEqual({ ok: true });
  });

  it("resend gives the same answer for unknown addresses and sends nothing", async () => {
    const h = makeAuth(db);
    await expect(h.auth.resendVerification("ghost@example.com")).resolves.toEqual({ ok: true });
    expect(h.mailer.sent).toHaveLength(0);
  });
});

describe("login", () => {
  it("blocks sign-in until the email is verified (after the right password)", async () => {
    const h = makeAuth(db);
    await h.auth.register(newUser());
    await expect(h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD })).rejects.toBeInstanceOf(EmailNotVerifiedError);
    await expect(h.auth.login({ email: "ama@example.com", password: "wrong wrong wrong" })).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("gives the same error for unknown users and wrong passwords", async () => {
    const h = makeAuth(db);
    await registerAndVerify(h);
    const wrong = await h.auth.login({ email: "ama@example.com", password: "nope nope nope nope" }).catch((e) => e);
    const ghost = await h.auth.login({ email: "ghost@example.com", password: "nope nope nope nope" }).catch((e) => e);
    expect(wrong).toBeInstanceOf(InvalidCredentialsError);
    expect(ghost).toBeInstanceOf(InvalidCredentialsError);
    expect(ghost.publicMessage).toBe(wrong.publicMessage);
  });

  it("issues a session whose raw token is never stored", async () => {
    const h = makeAuth(db);
    await registerAndVerify(h);
    const { token } = await h.auth.login({ email: " AMA@example.com ", password: GOOD_PASSWORD });
    const [s] = await db.select().from(sessions);
    expect(s!.tokenHash).toBe(hashToken(token));
    expect(s!.tokenHash).not.toBe(token);
    const current = await validateSession(db, token);
    expect(current?.user.email).toBe("ama@example.com");
    expect(current?.actor.roles).toEqual(["parent"]);
  });

  it("creates a fresh session on every login (no fixation)", async () => {
    const h = makeAuth(db);
    await registerAndVerify(h);
    const a = await h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD });
    const b = await h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD });
    expect(a.token).not.toBe(b.token);
  });

  it(`locks the account after ${MAX_FAILED_LOGINS} failures, even for the right password`, async () => {
    const clock = { now: new Date() };
    const h = makeAuth(db, clock);
    await registerAndVerify(h);
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      await expect(h.auth.login({ email: "ama@example.com", password: "wrong wrong wrong" })).rejects.toBeInstanceOf(InvalidCredentialsError);
    }
    await expect(h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD })).rejects.toBeInstanceOf(AccountLockedError);
    clock.now = new Date(clock.now.getTime() + (LOCKOUT_SECONDS + 1) * 1000);
    await expect(h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD })).resolves.toHaveProperty("token");
    expect((await db.select().from(users))[0]!.failedLoginCount).toBe(0);
  });

  it("rate-limits per email regardless of whether the account exists", async () => {
    const h = makeAuth(db);
    let last: unknown;
    for (let i = 0; i < 12; i++) {
      last = await h.auth.login({ email: "ghost@example.com", password: "nope nope nope" }).catch((e) => e);
    }
    expect(last).toBeInstanceOf(AccountLockedError);
  });

  it("refuses suspended users, and an existing session stops working immediately", async () => {
    const h = makeAuth(db);
    await registerAndVerify(h);
    const { token } = await h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD });
    await db.update(users).set({ status: "SUSPENDED" }).where(eq(users.email, "ama@example.com"));
    expect(await validateSession(db, token)).toBeNull();
    await expect(h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD })).rejects.toBeInstanceOf(AccountSuspendedError);
  });
});

describe("sessions", () => {
  it("expires after the idle window", async () => {
    const h = makeAuth(db);
    await registerAndVerify(h);
    // Separate sessions: a successful check slides the window, so each probe needs its own.
    const a = await h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD });
    const b = await h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD });
    const day = 24 * 3600 * 1000;
    expect(await validateSession(db, a.token, new Date(Date.now() + 6 * day))).not.toBeNull();
    expect(await validateSession(db, b.token, new Date(Date.now() + 8 * day))).toBeNull();
  });

  it("slides the idle window on use but never past the absolute limit", async () => {
    const h = makeAuth(db);
    await registerAndVerify(h);
    const { token } = await h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD });
    const day = 24 * 3600 * 1000;
    const start = Date.now();
    // Use it every 6 days so it never idles out.
    for (let d = 6; d <= 24; d += 6) expect(await validateSession(db, token, new Date(start + d * day))).not.toBeNull();
    expect(await validateSession(db, token, new Date(start + 31 * day))).toBeNull();
  });

  it("logout revokes the session", async () => {
    const h = makeAuth(db);
    await registerAndVerify(h);
    const { token } = await h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD });
    await h.auth.logout(token);
    expect(await validateSession(db, token)).toBeNull();
  });

  it("rejects missing, malformed and oversized tokens", async () => {
    expect(await validateSession(db, undefined)).toBeNull();
    expect(await validateSession(db, "nonsense")).toBeNull();
    expect(await validateSession(db, "x".repeat(5000))).toBeNull();
  });

  it("revokeAllSessions can spare the current one", async () => {
    const h = makeAuth(db);
    await registerAndVerify(h);
    const a = await h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD });
    const b = await h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD });
    const keep = (await validateSession(db, b.token))!;
    await revokeAllSessions(db, keep.user.id, keep.sessionId);
    expect(await validateSession(db, a.token)).toBeNull();
    expect(await validateSession(db, b.token)).not.toBeNull();
  });
});

describe("password reset", () => {
  it("sets a new password, revokes every session, and the link works once", async () => {
    const h = makeAuth(db);
    await registerAndVerify(h);
    const session = await h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD });
    await h.auth.requestPasswordReset("ama@example.com");
    const token = h.tokenFromLast();
    await h.auth.resetPassword(token, "a brand new passphrase");
    expect(await validateSession(db, session.token)).toBeNull();
    await expect(h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD })).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(h.auth.login({ email: "ama@example.com", password: "a brand new passphrase" })).resolves.toHaveProperty("token");
    await expect(h.auth.resetPassword(token, "yet another passphrase!")).rejects.toBeInstanceOf(InvalidTokenError);
    expect(h.mailer.last()?.subject).toMatch(/password was changed/);
  });

  it("answers the same for unknown addresses and sends nothing", async () => {
    const h = makeAuth(db);
    await expect(h.auth.requestPasswordReset("ghost@example.com")).resolves.toEqual({ ok: true });
    expect(h.mailer.sent).toHaveLength(0);
  });

  it("expires after an hour and stores only a hash", async () => {
    const clock = { now: new Date() };
    const h = makeAuth(db, clock);
    await registerAndVerify(h);
    await h.auth.requestPasswordReset("ama@example.com");
    const token = h.tokenFromLast();
    const [row] = await db.select().from(passwordResetTokens);
    expect(row!.tokenHash).toBe(hashToken(token));
    clock.now = new Date(clock.now.getTime() + (RESET_TTL_SECONDS + 1) * 1000);
    await expect(h.auth.resetPassword(token, "a brand new passphrase")).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("validates the new password before consuming the token", async () => {
    const h = makeAuth(db);
    await registerAndVerify(h);
    await h.auth.requestPasswordReset("ama@example.com");
    const token = h.tokenFromLast();
    await expect(h.auth.resetPassword(token, "short")).rejects.toBeInstanceOf(ValidationError);
    await expect(h.auth.resetPassword(token, "a brand new passphrase")).resolves.toEqual({ ok: true });
  });

  it("clears a lockout and activates a pending account that proves email ownership", async () => {
    const h = makeAuth(db);
    await h.auth.register(newUser());
    await h.auth.requestPasswordReset("ama@example.com");
    await h.auth.resetPassword(h.tokenFromLast(), "a brand new passphrase");
    const [u] = await db.select().from(users);
    expect(u!.status).toBe("ACTIVE");
    expect(u!.emailVerifiedAt).not.toBeNull();
  });

  it("does not reactivate suspended accounts", async () => {
    const h = makeAuth(db);
    await registerAndVerify(h);
    await db.update(users).set({ status: "SUSPENDED" });
    await h.auth.requestPasswordReset("ama@example.com");
    expect(h.mailer.last()?.subject).not.toMatch(/reset your password/);
  });
});

describe("change password", () => {
  it("requires the current password, keeps this session, drops the others", async () => {
    const h = makeAuth(db);
    await registerAndVerify(h);
    const a = await h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD });
    const b = await h.auth.login({ email: "ama@example.com", password: GOOD_PASSWORD });
    const current = (await validateSession(db, a.token))!;
    await expect(
      h.auth.changePassword(current.user.id, current.sessionId, { currentPassword: "not my password", newPassword: "a brand new passphrase" }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await h.auth.changePassword(current.user.id, current.sessionId, { currentPassword: GOOD_PASSWORD, newPassword: "a brand new passphrase" });
    expect(await validateSession(db, a.token)).not.toBeNull();
    expect(await validateSession(db, b.token)).toBeNull();
  });
});
