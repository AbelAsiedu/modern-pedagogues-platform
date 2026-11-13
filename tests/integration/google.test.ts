import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccountSuspendedError, ConflictError, MfaRequiredError } from "@/server/errors";
import type { GoogleProfile } from "@/server/auth/google";
import { validateSession } from "@/server/auth/sessions";
import { totpCode } from "@/server/auth/totp";
import { auditLogs, oauthIdentities, roles, sessions, userRoles, users } from "@/server/db/schema";
import { GOOD_PASSWORD, makeAuth, newUser, openTestDb, resetData } from "../support/harness";

const { pool, db } = openTestDb();
afterAll(() => pool.end());
beforeEach(() => resetData(db));

const profile = (over: Partial<GoogleProfile> = {}): GoogleProfile => ({ subject: "g-1", email: "ama@example.com", name: "Ama Mensah", ...over });
const userByEmail = async (email: string) => (await db.select().from(users).where(eq(users.email, email)))[0];
const roleKeys = async (userId: string) =>
  (await db.select({ key: roles.key }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, userId))).map((r) => r.key);

describe("Sign in with Google", () => {
  it("creates a confirmed account with no password on first use, with the chosen role, and signs it in", async () => {
    const { auth } = makeAuth(db);
    const r = await auth.signInWithGoogle(profile(), "student");
    const u = (await userByEmail("ama@example.com"))!;
    expect(u).toMatchObject({ status: "ACTIVE", passwordHash: null, fullName: "Ama Mensah" });
    expect(u.emailVerifiedAt).not.toBeNull();
    expect(await roleKeys(u.id)).toEqual(["student"]);
    expect((await validateSession(db, r.token))?.user.id).toBe(u.id);
    const [idn] = await db.select().from(oauthIdentities);
    expect(idn).toMatchObject({ userId: u.id, provider: "google", subject: "g-1" });
  });

  it("never lets a visitor pick a staff role through the address", async () => {
    const { auth } = makeAuth(db);
    await auth.signInWithGoogle(profile(), "admin");
    expect(await roleKeys((await userByEmail("ama@example.com"))!.id)).toEqual(["parent"]);
  });

  it("falls back to the part before the @ when Google gives no usable name", async () => {
    const { auth } = makeAuth(db);
    await auth.signInWithGoogle(profile({ name: "" }), "parent");
    expect((await userByEmail("ama@example.com"))!.fullName).toBe("ama");
  });

  it("signs the same Google account in again without making another account, even if the email changed on Google's side", async () => {
    const { auth } = makeAuth(db);
    await auth.signInWithGoogle(profile(), "parent");
    await auth.signInWithGoogle(profile({ email: "renamed@example.com" }), "parent");
    expect(await db.select().from(users)).toHaveLength(1);
    const [idn] = await db.select().from(oauthIdentities);
    expect(idn!.email).toBe("renamed@example.com");
  });

  it("links to an existing, confirmed password account with the same email and keeps its password and roles", async () => {
    const { auth, tokenFromLast } = makeAuth(db);
    await auth.register(newUser("ama@example.com", "student"));
    await auth.verifyEmail(tokenFromLast());
    const before = (await userByEmail("ama@example.com"))!;
    await auth.signInWithGoogle(profile(), "parent");
    const after = (await userByEmail("ama@example.com"))!;
    expect(after.id).toBe(before.id);
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(await roleKeys(after.id)).toEqual(["student"]);
    expect(await db.select().from(oauthIdentities)).toHaveLength(1);
    await expect(auth.login({ email: "ama@example.com", password: GOOD_PASSWORD })).resolves.toBeTruthy();
    const logged = await db.select().from(auditLogs).where(eq(auditLogs.action, "user.google_linked"));
    expect(logged).toHaveLength(1);
  });

  it("takes over an unconfirmed sign-up: the stranger's password is discarded and their sessions ended", async () => {
    const { auth } = makeAuth(db);
    await auth.register(newUser("ama@example.com")); // never confirmed: someone typed this address and a password of their own
    const squatter = (await userByEmail("ama@example.com"))!;
    expect(squatter.status).toBe("PENDING_VERIFICATION");
    await auth.signInWithGoogle(profile(), "parent");
    const after = (await userByEmail("ama@example.com"))!;
    expect(after).toMatchObject({ id: squatter.id, status: "ACTIVE", passwordHash: null });
    expect(after.emailVerifiedAt).not.toBeNull();
    await expect(auth.login({ email: "ama@example.com", password: GOOD_PASSWORD })).rejects.toThrow();
  });

  it("refuses a suspended account, whether found by Google identity or by email", async () => {
    const { auth } = makeAuth(db);
    await auth.signInWithGoogle(profile(), "parent");
    await db.update(users).set({ status: "SUSPENDED" }).where(eq(users.email, "ama@example.com"));
    await expect(auth.signInWithGoogle(profile(), "parent")).rejects.toBeInstanceOf(AccountSuspendedError);
    await db.delete(oauthIdentities);
    await expect(auth.signInWithGoogle(profile({ subject: "g-2" }), "parent")).rejects.toBeInstanceOf(AccountSuspendedError);
    expect(await db.select().from(oauthIdentities)).toHaveLength(0);
    expect(await db.select().from(sessions)).toHaveLength(1); // only the first sign-in's
  });

  it("will not attach a second, different Google account to the same person", async () => {
    const { auth } = makeAuth(db);
    await auth.signInWithGoogle(profile(), "parent");
    await expect(auth.signInWithGoogle(profile({ subject: "g-2" }), "parent")).rejects.toBeInstanceOf(ConflictError);
  });

  it("still asks for the authenticator code when two-step sign-in is on, and gives no session until it is right", async () => {
    const clock = { now: new Date() };
    const { auth } = makeAuth(db, clock);
    const first = await auth.signInWithGoogle(profile(), "parent");
    const u = (await userByEmail("ama@example.com"))!;
    const v = (await validateSession(db, first.token))!;
    await auth.mfa.beginSetup(u.id);
    const pending = (await auth.mfa.pendingSetup(u.id, u.email))!;
    await auth.mfa.confirmSetup(u.id, v.sessionId, totpCode(pending.secret, clock.now));
    const sessionsBefore = (await db.select().from(sessions)).length;

    let challenge = "";
    try {
      await auth.signInWithGoogle(profile(), "parent");
    } catch (e) {
      expect(e).toBeInstanceOf(MfaRequiredError);
      challenge = (e as MfaRequiredError).challenge;
    }
    expect(challenge).not.toBe("");
    expect((await db.select().from(sessions)).length).toBe(sessionsBefore);
    clock.now = new Date(clock.now.getTime() + 30_000);
    const done = await auth.mfa.completeLogin(challenge, totpCode(pending.secret, clock.now));
    expect((await validateSession(db, done.token))?.user.id).toBe(u.id);
  });

  it("is rate limited per address", async () => {
    const { auth } = makeAuth(db);
    let blocked = 0;
    for (let i = 0; i < 42; i++) {
      await auth.signInWithGoogle(profile(), "parent", { ip: "9.9.9.9" }).catch(() => blocked++);
    }
    expect(blocked).toBeGreaterThan(0);
  });

  it("two parallel first sign-ins end up as one account", async () => {
    const { auth } = makeAuth(db);
    await Promise.all([auth.signInWithGoogle(profile(), "parent"), auth.signInWithGoogle(profile(), "parent")]);
    expect(await db.select().from(users)).toHaveLength(1);
    expect(await db.select().from(oauthIdentities).where(and(eq(oauthIdentities.provider, "google")))).toHaveLength(1);
  });

  it("lets an account with no password manage two-step with the code alone, while a password account still needs the password", async () => {
    const clock = { now: new Date() };
    const { auth, tokenFromLast } = makeAuth(db, clock);
    const g = await auth.signInWithGoogle(profile(), "parent");
    const u = (await userByEmail("ama@example.com"))!;
    expect(await auth.mfa.hasPassword(u.id)).toBe(false);
    const v = (await validateSession(db, g.token))!;
    await auth.mfa.beginSetup(u.id);
    const pending = (await auth.mfa.pendingSetup(u.id, u.email))!;
    await auth.mfa.confirmSetup(u.id, v.sessionId, totpCode(pending.secret, clock.now));
    await expect(auth.mfa.regenerateRecoveryCodes(u.id, { code: "000000" })).rejects.toThrow();
    clock.now = new Date(clock.now.getTime() + 30_000);
    const fresh = await auth.mfa.regenerateRecoveryCodes(u.id, { code: totpCode(pending.secret, clock.now) });
    expect(fresh.recoveryCodes).toHaveLength(10);
    clock.now = new Date(clock.now.getTime() + 30_000);
    await auth.mfa.disable(u.id, v.sessionId, { code: totpCode(pending.secret, clock.now) });
    expect(await auth.mfa.isEnabledFor(u.id)).toBe(false);

    // A person with a password is unchanged: the code alone is not enough.
    await auth.register(newUser("kofi@example.com"));
    await auth.verifyEmail(tokenFromLast());
    const k = (await userByEmail("kofi@example.com"))!;
    const kv = (await validateSession(db, (await auth.login({ email: "kofi@example.com", password: GOOD_PASSWORD })).token))!;
    await auth.mfa.beginSetup(k.id);
    const kp = (await auth.mfa.pendingSetup(k.id, k.email))!;
    await auth.mfa.confirmSetup(k.id, kv.sessionId, totpCode(kp.secret, clock.now));
    clock.now = new Date(clock.now.getTime() + 30_000);
    await expect(auth.mfa.disable(k.id, kv.sessionId, { code: totpCode(kp.secret, clock.now) })).rejects.toThrow();
    expect(await auth.mfa.isEnabledFor(k.id)).toBe(true);
  });
});
