import { describe, expect, it } from "vitest";
import {
  authorizationUrl,
  codeChallenge,
  exchangeCode,
  GoogleSignInError,
  newOAuthParams,
  readIdToken,
  type GoogleConfig,
} from "@/server/auth/google";
import { fakeIdToken } from "../support/google";

const CLIENT = "client-123.apps.googleusercontent.com";
const cfg = (fetchImpl?: typeof fetch): GoogleConfig => ({
  clientId: CLIENT,
  clientSecret: "secret-secret",
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  redirectUri: "https://tmp.example/api/auth/google/callback",
  fetchImpl,
});
const reason = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof GoogleSignInError ? e.reason : "other";
  }
  return "none";
};

describe("Google sign-in: the trip out", () => {
  it("builds an address with state, nonce and a PKCE challenge (never the verifier or the secret)", () => {
    const p = newOAuthParams();
    const u = new URL(authorizationUrl(cfg(), p));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("client_id")).toBe(CLIENT);
    expect(u.searchParams.get("redirect_uri")).toBe("https://tmp.example/api/auth/google/callback");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("scope")).toBe("openid email profile");
    expect(u.searchParams.get("state")).toBe(p.state);
    expect(u.searchParams.get("nonce")).toBe(p.nonce);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBe(codeChallenge(p.verifier));
    expect(u.toString()).not.toContain(p.verifier);
    expect(u.toString()).not.toContain("secret-secret");
  });

  it("matches the PKCE example in RFC 7636", () => {
    expect(codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("makes fresh, unguessable values every time", () => {
    const a = newOAuthParams();
    const b = newOAuthParams();
    expect(a.state).not.toBe(b.state);
    expect(a.verifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe("Google sign-in: reading the ID token", () => {
  const ok = { clientId: CLIENT, nonce: "n" };

  it("returns who signed in, with the email lower-cased", () => {
    expect(readIdToken(fakeIdToken({ email: "Ama@Example.com" }), ok)).toEqual({ subject: "1099887766", email: "ama@example.com", name: "Ama Mensah" });
  });

  it("refuses a token for another app, from another issuer, expired, or carrying someone else's nonce", () => {
    expect(reason(() => readIdToken(fakeIdToken({ aud: "other.apps.googleusercontent.com" }), ok))).toBe("failed");
    expect(reason(() => readIdToken(fakeIdToken({ iss: "https://evil.example" }), ok))).toBe("failed");
    expect(reason(() => readIdToken(fakeIdToken({ exp: Math.floor(Date.now() / 1000) - 10 }), ok))).toBe("failed");
    expect(reason(() => readIdToken(fakeIdToken({ nonce: "different" }), ok))).toBe("failed");
    expect(reason(() => readIdToken(fakeIdToken({ nonce: undefined }), ok))).toBe("failed");
  });

  it("accepts the older issuer spelling and an audience list that includes us", () => {
    expect(reason(() => readIdToken(fakeIdToken({ iss: "accounts.google.com" }), ok))).toBe("none");
    expect(reason(() => readIdToken(fakeIdToken({ aud: ["x", CLIENT] }), ok))).toBe("none");
  });

  it("refuses an email Google has not verified", () => {
    expect(reason(() => readIdToken(fakeIdToken({ email_verified: false }), ok))).toBe("unverified");
    expect(reason(() => readIdToken(fakeIdToken({ email_verified: undefined }), ok))).toBe("unverified");
  });

  it("refuses junk and missing fields", () => {
    expect(reason(() => readIdToken("not-a-token", ok))).toBe("failed");
    expect(reason(() => readIdToken("a.!!!.c", ok))).toBe("failed");
    expect(reason(() => readIdToken(fakeIdToken({ sub: "" }), ok))).toBe("failed");
    expect(reason(() => readIdToken(fakeIdToken({ email: "nope" }), ok))).toBe("failed");
    expect(reason(() => readIdToken(fakeIdToken({ email: undefined }), ok))).toBe("failed");
  });
});

describe("Google sign-in: trading the code", () => {
  it("posts the code, our secret and the PKCE verifier, and returns the ID token", async () => {
    let seen: { url: string; body: URLSearchParams } | null = null;
    const f = (async (url: string, init?: RequestInit) => {
      seen = { url, body: new URLSearchParams(String(init?.body)) };
      return new Response(JSON.stringify({ id_token: "abc.def.ghi", access_token: "x" }));
    }) as unknown as typeof fetch;
    expect(await exchangeCode(cfg(f), "the-code", "the-verifier")).toBe("abc.def.ghi");
    expect(seen!.url).toBe("https://oauth2.googleapis.com/token");
    expect(Object.fromEntries(seen!.body)).toMatchObject({
      code: "the-code",
      client_id: CLIENT,
      client_secret: "secret-secret",
      grant_type: "authorization_code",
      code_verifier: "the-verifier",
      redirect_uri: "https://tmp.example/api/auth/google/callback",
    });
  });

  it("fails cleanly when Google refuses, answers nonsense, or cannot be reached", async () => {
    const refuse = (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as unknown as typeof fetch;
    const junk = (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch;
    const noToken = (async () => new Response(JSON.stringify({ access_token: "x" }))) as unknown as typeof fetch;
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    for (const f of [refuse, junk, noToken, down]) {
      await expect(exchangeCode(cfg(f), "c", "v")).rejects.toMatchObject({ name: "GoogleSignInError", reason: "failed" });
    }
  });
});
