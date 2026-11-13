import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { codeChallenge, type GoogleConfig } from "@/server/auth/google";
import { validateSession } from "@/server/auth/sessions";
import { totpCode } from "@/server/auth/totp";
import { sessions, users } from "@/server/db/schema";
import { makeAuth, openTestDb, resetData } from "../support/harness";
import { fakeIdToken } from "../support/google";

const { pool, db } = openTestDb();
afterAll(() => pool.end());

const CLIENT = "client-123.apps.googleusercontent.com";
const jar = new Map<string, string>();
const state: { enabled: boolean; clock: { now: Date }; auth: ReturnType<typeof makeAuth>["auth"]; token: Response | Error; lastTokenBody: URLSearchParams | null } = {
  enabled: true,
  clock: { now: new Date() },
  auth: undefined as never,
  token: new Response("{}"),
  lastTokenBody: null,
};
const cfg = (): GoogleConfig => ({
  clientId: CLIENT,
  clientSecret: "secret-secret",
  authUrl: "https://accounts.google.test/auth",
  tokenUrl: "https://google.test/token",
  redirectUri: "https://tmp.example/api/auth/google/callback",
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) && jar.get(n) !== "" ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
  }),
}));
vi.mock("@/server/env", () => ({ env: () => ({ APP_URL: "https://tmp.example", NODE_ENV: "production" }) }));
vi.mock("@/server/db", () => ({ db: () => db }));
vi.mock("@/server/logger", async (orig) => ({ ...(await orig<typeof import("@/server/logger")>()), logger: { warn: () => {}, error: () => {}, info: () => {} } }));
vi.mock("@/server/context", () => ({
  googleConfig: () => (state.enabled ? cfg() : null),
  googleCookieName: () => "__Host-tmp_google",
  authService: () => state.auth,
  requestContext: async () => ({ ip: "1.2.3.4", userAgent: "test" }),
  setSessionCookie: async (t: string) => void jar.set("session", t),
  setMfaChallengeCookie: async (t: string) => void jar.set("mfa", t),
  staffTwoStepEnforced: () => false,
  postSignInPath: (s: { actor: unknown } | null, next: string) => (s ? next || "/account" : "/login"),
}));
// The route talks to Google with the global fetch.
vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
  state.lastTokenBody = new URLSearchParams(String(init?.body));
  if (state.token instanceof Error) throw state.token;
  return state.token.clone();
});

const { GET: start } = await import("@/app/api/auth/google/start/route");
const { GET: callback } = await import("@/app/api/auth/google/callback/route");

const idToken = (c: Record<string, unknown> = {}) => new Response(JSON.stringify({ id_token: fakeIdToken({ aud: CLIENT, nonce: saved().nonce, ...c }) }));
const saved = () => JSON.parse(jar.get("__Host-tmp_google")!) as { state: string; nonce: string; verifier: string; role: string; next: string };
const go = (qs: string) => callback(new NextRequest(`https://tmp.example/api/auth/google/callback?${qs}`));
const location = (r: Response) => new URL(r.headers.get("location")!).pathname + new URL(r.headers.get("location")!).search;

beforeEach(async () => {
  await resetData(db);
  jar.clear();
  state.enabled = true;
  state.clock = { now: new Date() };
  state.auth = makeAuth(db, state.clock).auth;
  state.lastTokenBody = null;
});

describe("GET /api/auth/google/start", () => {
  it("remembers one-time values in a cookie and sends the browser to Google with matching state, nonce and PKCE challenge", async () => {
    const r = await start(new NextRequest("https://tmp.example/api/auth/google/start?role=student&next=/resources"));
    expect(r.status).toBe(303);
    const to = new URL(r.headers.get("location")!);
    expect(to.origin).toBe("https://accounts.google.test");
    const s = saved();
    expect(s).toMatchObject({ role: "student", next: "/resources" });
    expect(to.searchParams.get("state")).toBe(s.state);
    expect(to.searchParams.get("nonce")).toBe(s.nonce);
    expect(to.searchParams.get("code_challenge")).toBe(codeChallenge(s.verifier));
  });

  it("ignores unknown roles and outside destinations", async () => {
    await start(new NextRequest("https://tmp.example/api/auth/google/start?role=admin&next=https://evil.example"));
    expect(saved()).toMatchObject({ role: "parent", next: "" });
  });

  it("goes back to the sign-in page when Google sign-in is not configured", async () => {
    state.enabled = false;
    const r = await start(new NextRequest("https://tmp.example/api/auth/google/start"));
    expect(location(r)).toBe("/login?google=unavailable");
    expect(jar.has("__Host-tmp_google")).toBe(false);
  });
});

describe("GET /api/auth/google/callback", () => {
  async function begin(qs = "role=parent") {
    await start(new NextRequest(`https://tmp.example/api/auth/google/start?${qs}`));
    return saved();
  }

  it("signs the person in, makes the account, and spends the ticket", async () => {
    const s = await begin("role=student&next=/resources");
    state.token = idToken();
    const r = await go(`code=abc&state=${s.state}`);
    expect(r.status).toBe(303);
    expect(location(r)).toBe("/resources");
    expect(state.lastTokenBody!.get("code_verifier")).toBe(s.verifier);
    expect(state.lastTokenBody!.get("code")).toBe("abc");
    expect((await validateSession(db, jar.get("session")))?.user.email).toBe("ama@example.com");
    expect(jar.get("__Host-tmp_google")).toBe("");
    // replaying the same return trip does nothing
    jar.delete("session");
    const again = await go(`code=abc&state=${s.state}`);
    expect(location(again)).toBe("/login?google=expired");
    expect(jar.has("session")).toBe(false);
  });

  it("refuses a return trip that this browser did not start (wrong state, no cookie)", async () => {
    const s = await begin();
    state.token = idToken();
    expect(location(await go("code=abc&state=wrong"))).toBe("/login?google=expired");
    expect(jar.has("session")).toBe(false);
    jar.clear();
    expect(location(await go(`code=abc&state=${s.state}`))).toBe("/login?google=expired");
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("handles Cancel on Google's page", async () => {
    await begin();
    expect(location(await go("error=access_denied"))).toBe("/login?google=denied");
    await begin();
    expect(location(await go("error=server_error"))).toBe("/login?google=failed");
  });

  it("refuses unverified emails, a token meant for another sign-in, and Google being down — with no account made", async () => {
    let s = await begin();
    state.token = idToken({ email_verified: false });
    expect(location(await go(`code=abc&state=${s.state}`))).toBe("/login?google=unverified");
    s = await begin();
    state.token = idToken({ nonce: "someone-elses" });
    expect(location(await go(`code=abc&state=${s.state}`))).toBe("/login?google=failed");
    s = await begin();
    state.token = new TypeError("fetch failed");
    expect(location(await go(`code=abc&state=${s.state}`))).toBe("/login?google=failed");
    s = await begin();
    state.token = new Response("{}", { status: 400 });
    expect(location(await go(`code=abc&state=${s.state}`))).toBe("/login?google=failed");
    expect(await db.select().from(users)).toHaveLength(0);
    expect(jar.has("session")).toBe(false);
  });

  it("hands an account with two-step sign-in to the code step instead of signing in", async () => {
    let s = await begin();
    state.token = idToken();
    await go(`code=abc&state=${s.state}`);
    const [u] = await db.select().from(users);
    const v = (await validateSession(db, jar.get("session")))!;
    await state.auth.mfa.beginSetup(u!.id);
    const pending = (await state.auth.mfa.pendingSetup(u!.id, u!.email))!;
    await state.auth.mfa.confirmSetup(u!.id, v.sessionId, totpCode(pending.secret, state.clock.now));
    jar.clear();
    const before = (await db.select().from(sessions)).length;

    s = await begin("role=parent&next=/account/orders");
    state.token = idToken();
    const r = await go(`code=abc&state=${s.state}`);
    expect(location(r)).toBe("/login/two-step?next=%2Faccount%2Forders");
    expect(jar.get("mfa")).toBeTruthy();
    expect(jar.has("session")).toBe(false);
    expect((await db.select().from(sessions)).length).toBe(before);
  });

  it("tells a suspended person, without signing them in", async () => {
    let s = await begin();
    state.token = idToken();
    await go(`code=abc&state=${s.state}`);
    await db.update(users).set({ status: "SUSPENDED" });
    jar.clear();
    s = await begin();
    state.token = idToken();
    expect(location(await go(`code=abc&state=${s.state}`))).toBe("/login?google=suspended");
    expect(jar.has("session")).toBe(false);
  });
});

