import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "@/server/env";

const state: { env: Record<string, string | undefined> } = { env: {} };
const warn = vi.fn();
vi.mock("@/server/env", async (orig) => ({ ...(await orig<typeof import("@/server/env")>()), env: () => parseEnv(state.env) }));
vi.mock("@/server/logger", async (orig) => ({ ...(await orig<typeof import("@/server/logger")>()), logger: { warn, error: () => {}, info: () => {} } }));
const { googleConfig } = await import("@/server/context");

const base = { NODE_ENV: "production", APP_URL: "https://tmp.example", DATABASE_URL: "postgres://x", EMAIL_PROVIDER: "smtp", SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASSWORD: "p" };
const ID = "1234567890-abcdef.apps.googleusercontent.com";

beforeEach(() => warn.mockClear());

describe("Sign in with Google settings never stop the site from starting", () => {
  it("is off, without a warning, when neither value is set", () => {
    state.env = base;
    expect(() => parseEnv(state.env)).not.toThrow();
    expect(googleConfig()).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("is on with both values, with the callback built from APP_URL", () => {
    state.env = { ...base, GOOGLE_CLIENT_ID: ID, GOOGLE_CLIENT_SECRET: "a-long-enough-secret" };
    expect(googleConfig()).toMatchObject({ clientId: ID, redirectUri: "https://tmp.example/api/auth/google/callback" });
  });

  it("stays off, and the app still starts, when only one value is set or the id is mistyped", () => {
    for (const env of [
      { GOOGLE_CLIENT_ID: ID },
      { GOOGLE_CLIENT_SECRET: "a-long-enough-secret" },
      { GOOGLE_CLIENT_ID: "not-an-id", GOOGLE_CLIENT_SECRET: "a-long-enough-secret" },
      { GOOGLE_CLIENT_ID: ID, GOOGLE_CLIENT_SECRET: "short" },
    ]) {
      state.env = { ...base, ...env };
      expect(() => parseEnv(state.env)).not.toThrow();
      expect(googleConfig()).toBeNull();
    }
    expect(warn).toHaveBeenCalledTimes(1); // said once, not on every page view
  });

  it("ignores stray spaces around pasted values", () => {
    state.env = { ...base, GOOGLE_CLIENT_ID: ` ${ID} `, GOOGLE_CLIENT_SECRET: " a-long-enough-secret\n" };
    expect(googleConfig()?.clientSecret).toBe("a-long-enough-secret");
  });
});
