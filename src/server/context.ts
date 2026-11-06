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
import { loadSiteText } from "./content/site-content";
import { createMailer } from "./email/factory";
import { env } from "./env";
import { logger } from "./logger";
import { can, type Actor } from "./permissions/authorize";
import type { Permission } from "./permissions/catalog";

let authSingleton: AuthService | undefined;
export function authService(): AuthService {
  if (!authSingleton) {
    const e = env();
    authSingleton = createAuthService({ db: db(), mailer: createMailer(e, logger), log: logger, appUrl: e.APP_URL });
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

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(cookieName());
}

/** Current signed-in user for this request (memoised), or null. */
/** Admin-editable site text, loaded once per request. Falls back to the built-in text if the database is down. */
export const getSiteText = cache(() => loadSiteText(() => db()));

export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(cookieName())?.value;
  return validateSession(db(), token);
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
