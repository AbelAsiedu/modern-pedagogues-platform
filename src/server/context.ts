import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { safeNext } from "../lib/safe-redirect";
import { createAuthService, type AuthService, type RequestContext } from "./auth/service";
import {
  SESSION_ABSOLUTE_SECONDS,
  sessionCookieName,
  validateSession,
  type SessionUser,
} from "./auth/sessions";
import { db } from "./db";
import { MFA_CHALLENGE_TTL_SECONDS } from "./auth/mfa";
import { parseEncryptionKey } from "./auth/secret-box";
import { loadSiteText } from "./content/site-content";
import { createMailer } from "./email/factory";
import { createProviders, type LlmProvider } from "./assistant/providers";
import type { AssistantDeps } from "./assistant/service";
import type { DeliverDeps } from "./email/deliver";
import type { Mailer } from "./email/mailer";
import { env } from "./env";
import { logger } from "./logger";
import { can, type Actor } from "./permissions/authorize";
import type { Permission } from "./permissions/catalog";

let mailerSingleton: Mailer | undefined;
export function mailer(): Mailer {
  mailerSingleton ??= createMailer(env(), logger);
  return mailerSingleton;
}

/** Everything a service needs to record and send an email. */
export function emailDeps(): DeliverDeps & { appUrl: string } {
  return { db: db(), mailer: mailer(), log: logger, appUrl: env().APP_URL };
}

let providersSingleton: LlmProvider[] | undefined;
/** Kaitlyn's language-model providers (those with a key). Empty when the assistant is not configured. */
export function assistantProviders(): LlmProvider[] {
  providersSingleton ??= createProviders(env());
  return providersSingleton;
}

export function assistantDeps(): AssistantDeps {
  return { db: db(), providers: assistantProviders(), log: logger, siteText: getSiteText, dailyLimit: env().ASSISTANT_DAILY_LIMIT };
}

/** The key that encrypts authenticator seeds, or null when the site has not been given one. */
export function mfaKey(): Buffer | null {
  const k = env().MFA_ENCRYPTION_KEY;
  return k ? parseEncryptionKey(k) : null;
}

/** Staff must have two-step sign-in before their roles take effect. Needs a key, otherwise nobody could set it up. */
export function staffTwoStepEnforced(): boolean {
  return env().STAFF_MFA_REQUIRED && mfaKey() !== null;
}

let authSingleton: AuthService | undefined;
export function authService(): AuthService {
  if (!authSingleton) {
    authSingleton = createAuthService({ db: db(), mailer: mailer(), log: logger, appUrl: env().APP_URL, mfaKey: mfaKey() });
  }
  return authSingleton;
}

const isProd = () => env().NODE_ENV === "production";
export const cookieName = () => sessionCookieName(isProd());

/**
 * Client IP and user agent for rate limiting and audit. Heroku's router appends the real client
 * address to the END of X-Forwarded-For, so the last entry is the trustworthy one; earlier entries
 * can be forged by the client.
 */
export async function requestContext(): Promise<RequestContext> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",").map((s) => s.trim()).filter(Boolean).at(-1) ?? null : null;
  return { ip, userAgent: h.get("user-agent") };
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(cookieName(), token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_ABSOLUTE_SECONDS,
  });
}

/**
 * Expire a cookie by setting it again with the same attributes it was created with. A plain delete() omits `Secure`,
 * and browsers refuse to touch a `__Host-` cookie that way, so in production the cookie would stay behind after sign-out.
 */
async function expireCookie(name: string): Promise<void> {
  (await cookies()).set(name, "", { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/", maxAge: 0 });
}

export async function clearSessionCookie(): Promise<void> {
  await expireCookie(cookieName());
}

/** Holds the single-use ticket between "password correct" and "code correct". Lives five minutes. */
export const mfaCookieName = () => (isProd() ? "__Host-tmp_mfa" : "tmp_mfa");

export async function setMfaChallengeCookie(token: string): Promise<void> {
  (await cookies()).set(mfaCookieName(), token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: MFA_CHALLENGE_TTL_SECONDS,
  });
}

export async function getMfaChallengeCookie(): Promise<string | undefined> {
  return (await cookies()).get(mfaCookieName())?.value;
}

export async function clearMfaChallengeCookie(): Promise<void> {
  await expireCookie(mfaCookieName());
}

/** Current signed-in user for this request (memoised), or null. */
/** Admin-editable site text, loaded once per request. Falls back to the built-in text if the database is down. */
export const getSiteText = cache(() => loadSiteText(() => db()));

export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(cookieName())?.value;
  return validateSession(db(), token, new Date(), { requireStaffTwoStep: staffTwoStepEnforced() });
});

export async function getActor(): Promise<Actor | null> {
  return (await getSession())?.actor ?? null;
}

/** For pages: send signed-out visitors to sign-in. */
export async function requireSession(nextPath: string): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return s;
}

/** For admin pages: signed-out go to sign-in; signed-in without the permission see a 404 (the area is not advertised). */
export async function requirePermission(permission: Permission, nextPath: string): Promise<SessionUser> {
  const s = await requireSession(nextPath);
  if (!can(s.actor, permission)) notFound();
  return s;
}

/** For server actions: returns the actor or throws so the caller reports a clean error. */
export async function requireActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) throw new (await import("./errors")).AuthenticationError();
  return a;
}


export { safeNext };
