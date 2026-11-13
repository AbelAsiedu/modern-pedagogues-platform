import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { authorizationUrl, newOAuthParams } from "@/server/auth/google";
import { googleConfig, googleCookieName } from "@/server/context";
import { env } from "@/server/env";
import { safeNext } from "@/lib/safe-redirect";

export const dynamic = "force-dynamic";

/** Step 1 of "Sign in with Google": remember the one-time values in a cookie, then send the browser to Google. */
export async function GET(req: NextRequest) {
  const base = env().APP_URL;
  const cfg = googleConfig();
  if (!cfg) return NextResponse.redirect(new URL("/login?google=unavailable", base), { status: 303 });

  const p = newOAuthParams();
  const role = req.nextUrl.searchParams.get("role") === "student" ? "student" : "parent";
  const next = safeNext(req.nextUrl.searchParams.get("next"), "");
  (await cookies()).set(googleCookieName(), JSON.stringify({ ...p, role, next }), {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax", // must be sent when Google sends the browser back
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(authorizationUrl(cfg, p), { status: 303, headers: { "Cache-Control": "no-store" } });
}
