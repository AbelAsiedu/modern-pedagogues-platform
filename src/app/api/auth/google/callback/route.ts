import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, GoogleSignInError, readIdToken, sameSecret } from "@/server/auth/google";
import { validateSession } from "@/server/auth/sessions";
import { db } from "@/server/db";
import {
  authService,
  googleConfig,
  googleCookieName,
  postSignInPath,
  requestContext,
  setMfaChallengeCookie,
  setSessionCookie,
  staffTwoStepEnforced,
} from "@/server/context";
import { env } from "@/server/env";
import { AccountLockedError, AccountSuspendedError, ConflictError, MfaRequiredError } from "@/server/errors";
import { logger } from "@/server/logger";
import { safeNext } from "@/lib/safe-redirect";

export const dynamic = "force-dynamic";

type Saved = { state: string; nonce: string; verifier: string; role: string; next: string };

function readSaved(raw: string | undefined): Saved | null {
  if (!raw || raw.length > 2000) return null;
  try {
    const v = JSON.parse(raw) as Partial<Saved>;
    if ([v.state, v.nonce, v.verifier, v.role, v.next].every((x) => typeof x === "string")) return v as Saved;
  } catch {
    /* fall through */
  }
  return null;
}

/** Step 2: Google sends the browser back here with a one-time code. Nothing in the address is trusted until it checks out. */
export async function GET(req: NextRequest) {
  const base = env().APP_URL;
  const back = (reason: string) => NextResponse.redirect(new URL(`/login?google=${reason}`, base), { status: 303, headers: { "Cache-Control": "no-store" } });
  const jar = await cookies();
  const saved = readSaved(jar.get(googleCookieName())?.value);
  // One try only: whatever happens next, this ticket is spent.
  jar.set(googleCookieName(), "", { httpOnly: true, secure: env().NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });

  const cfg = googleConfig();
  if (!cfg) return back("unavailable");
  const q = req.nextUrl.searchParams;
  if (q.get("error")) return back(q.get("error") === "access_denied" ? "denied" : "failed");
  const code = q.get("code") ?? "";
  const state = q.get("state") ?? "";
  if (!saved || !code || code.length > 2000 || !sameSecret(state, saved.state)) return back("expired");

  try {
    const idToken = await exchangeCode(cfg, code, saved.verifier);
    const profile = readIdToken(idToken, { clientId: cfg.clientId, nonce: saved.nonce });
    const ctx = await requestContext();
    try {
      const { token } = await authService().signInWithGoogle(profile, saved.role, ctx);
      await setSessionCookie(token);
      const session = await validateSession(db(), token, new Date(), { requireStaffTwoStep: staffTwoStepEnforced() });
      return NextResponse.redirect(new URL(postSignInPath(session, safeNext(saved.next, "")), base), { status: 303, headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      // Google vouched for the person, but this account has two-step sign-in on: the authenticator code is still needed.
      if (err instanceof MfaRequiredError) {
        await setMfaChallengeCookie(err.challenge);
        return NextResponse.redirect(new URL(saved.next ? `/login/two-step?next=${encodeURIComponent(saved.next)}` : "/login/two-step", base), {
          status: 303,
          headers: { "Cache-Control": "no-store" },
        });
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof GoogleSignInError) {
      if (err.reason === "failed") logger.warn({ detail: err.message }, "google sign-in failed");
      return back(err.reason);
    }
    if (err instanceof AccountSuspendedError) return back("suspended");
    if (err instanceof ConflictError) return back("conflict");
    if (err instanceof AccountLockedError) return back("busy");
    logger.error({ err }, "google sign-in crashed");
    return back("failed");
  }
}
