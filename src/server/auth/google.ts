import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { emailSchema } from "./validation";

/**
 * "Sign in with Google" (OpenID Connect, authorization-code flow with PKCE). Three protections against forged or
 * replayed sign-ins: `state` (ties the return trip to the browser that started it), `nonce` (ties the ID token to
 * this sign-in) and the PKCE verifier (ties the code exchange to us). The ID token is read straight from Google's
 * token endpoint over TLS together with our client secret, which is the case OpenID Connect allows to skip signature
 * checking; its claims (issuer, audience, expiry, nonce, verified email) are all still checked.
 */
export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
};

export type GoogleFailure = "denied" | "unverified" | "failed";

export class GoogleSignInError extends Error {
  constructor(public readonly reason: GoogleFailure, detail?: string) {
    super(detail ?? reason);
    this.name = "GoogleSignInError";
  }
}

const b64url = (b: Buffer) => b.toString("base64url");

export function newOAuthParams() {
  return { state: b64url(randomBytes(24)), nonce: b64url(randomBytes(24)), verifier: b64url(randomBytes(48)) };
}

export const codeChallenge = (verifier: string) => b64url(createHash("sha256").update(verifier).digest());

export function authorizationUrl(cfg: GoogleConfig, p: { state: string; nonce: string; verifier: string }): string {
  const u = new URL(cfg.authUrl);
  u.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: p.state,
    nonce: p.nonce,
    code_challenge: codeChallenge(p.verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return u.toString();
}

export function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Trade the one-time code for the ID token. */
export async function exchangeCode(cfg: GoogleConfig, code: string, verifier: string): Promise<string> {
  let res: Response;
  try {
    res = await (cfg.fetchImpl ?? fetch)(cfg.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }).toString(),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new GoogleSignInError("failed", "could not reach Google");
  }
  let body: { id_token?: unknown } | null = null as { id_token?: unknown } | null;
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* handled below */
  }
  if (!res.ok || !body || typeof body.id_token !== "string") throw new GoogleSignInError("failed", `token endpoint answered ${res.status}`);
  return body.id_token;
}

export type GoogleProfile = { subject: string; email: string; name: string };

const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

/** Check the ID token's claims and return who signed in. Throws GoogleSignInError for anything off. */
export function readIdToken(idToken: string, o: { clientId: string; nonce: string; now?: Date }): GoogleProfile {
  const parts = idToken.split(".");
  if (parts.length !== 3 || idToken.length > 8000) throw new GoogleSignInError("failed", "malformed id_token");
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new GoogleSignInError("failed", "unreadable id_token");
  }
  const nowS = Math.floor((o.now ?? new Date()).getTime() / 1000);
  if (typeof c.iss !== "string" || !ISSUERS.has(c.iss)) throw new GoogleSignInError("failed", "wrong issuer");
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(o.clientId)) throw new GoogleSignInError("failed", "wrong audience");
  if (typeof c.exp !== "number" || c.exp <= nowS) throw new GoogleSignInError("failed", "id_token expired");
  if (typeof c.iat === "number" && c.iat > nowS + 300) throw new GoogleSignInError("failed", "id_token from the future");
  if (typeof c.nonce !== "string" || !sameSecret(c.nonce, o.nonce)) throw new GoogleSignInError("failed", "nonce mismatch");
  if (typeof c.sub !== "string" || c.sub.length < 1 || c.sub.length > 255) throw new GoogleSignInError("failed", "no subject");
  if (typeof c.email !== "string") throw new GoogleSignInError("failed", "no email");
  const verified = c.email_verified === true || c.email_verified === "true";
  if (!verified) throw new GoogleSignInError("unverified");
  const email = emailSchema.safeParse(c.email);
  if (!email.success) throw new GoogleSignInError("failed", "invalid email");
  const name = typeof c.name === "string" ? c.name.trim().slice(0, 120) : "";
  return { subject: c.sub, email: email.data, name };
}
