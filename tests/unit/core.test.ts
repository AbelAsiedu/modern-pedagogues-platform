import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { uuidv7 } from "@/lib/id";
import { hashPassword, passwordSchema, verifyAgainstDummy, verifyPassword } from "@/server/auth/password";
import { generateToken, hashToken, safeEqual } from "@/server/auth/tokens";
import { parseOrThrow, registerSchema } from "@/server/auth/validation";
import { EnvError, parseEnv } from "@/server/env";
import {
  AccountLockedError,
  ForbiddenError,
  ValidationError,
  toErrorResponse,
} from "@/server/errors";
import { createLogger } from "@/server/logger";

describe("uuidv7", () => {
  it("is version 7, variant 10xx, and time-ordered", () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
    expect(new Set(Array.from({ length: 1000 }, () => uuidv7())).size).toBe(1000);
  });
});

describe("tokens", () => {
  it("generates unique 256-bit url-safe tokens and hashes them deterministically", () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(t);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(t);
  });
  it("compares in constant-time shape", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("passwords", () => {
  it("hashes with argon2id and verifies", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(h, "wrong password entirely")).toBe(false);
    expect(await hashPassword("correct horse battery staple")).not.toBe(h); // unique salts
  });
  it("treats a malformed stored hash as a failed login, not a crash", async () => {
    expect(await verifyPassword("not-a-hash", "whatever")).toBe(false);
  });
  it("dummy verification always fails", async () => {
    expect(await verifyAgainstDummy("anything")).toBe(false);
  });
  it("enforces length policy", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("a".repeat(129)).success).toBe(false);
    expect(passwordSchema.safeParse(" ".repeat(14)).success).toBe(false);
    expect(passwordSchema.safeParse("a long enough passphrase").success).toBe(true);
  });
});

describe("registration validation", () => {
  const valid = { email: "  Ama@Example.COM ", fullName: "Ama Mensah", password: "a long enough passphrase", role: "parent" };
  it("normalises email and accepts valid input", () => {
    expect(parseOrThrow(registerSchema, valid).email).toBe("ama@example.com");
  });
  it("does not allow self-registering into privileged roles", () => {
    for (const role of ["super_admin", "admin", "finance_manager", "tutor", "creator"]) {
      expect(() => parseOrThrow(registerSchema, { ...valid, role })).toThrow(ValidationError);
    }
  });
  it("reports field-level errors", () => {
    try {
      parseOrThrow(registerSchema, { ...valid, email: "nope", password: "x" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(Object.keys((e as ValidationError).fieldErrors).sort()).toEqual(["email", "password"]);
    }
  });
});

describe("env", () => {
  const base = { APP_URL: "http://localhost:3000", DATABASE_URL: "postgresql://x@h/db" };
  it("applies defaults and validates", () => {
    const e = parseEnv(base);
    expect(e.NODE_ENV).toBe("development");
    expect(e.DATABASE_POOL_MAX).toBe(10);
  });
  it("lists every problem at once", () => {
    try {
      parseEnv({});
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      expect((e as EnvError).issues.length).toBeGreaterThanOrEqual(2);
    }
  });
  it("refuses unsafe production configuration", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production" })).toThrow(/https/);
    expect(() => parseEnv({ ...base, NODE_ENV: "production", APP_URL: "https://tmp.example" })).toThrow(/console/);
  });
});

describe("errors", () => {
  it("never leaks internal messages", () => {
    const { status, body } = toErrorResponse(new Error("SELECT * FROM users failed: password=hunter2"));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });
  it("exposes only the public message for app errors", () => {
    const { status, body } = toErrorResponse(new ForbiddenError("missing permission: finance.refund"));
    expect(status).toBe(403);
    expect(JSON.stringify(body)).not.toContain("finance.refund");
  });
  it("includes retry-after for lockouts", () => {
    expect(toErrorResponse(new AccountLockedError(42)).body.error.retryAfterSeconds).toBe(42);
  });
});

describe("logger redaction", () => {
  it("redacts secrets by key", () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const log = createLogger("info", sink);
    log.info({ password: "hunter2", user: { token: "tok-123", name: "Ama" }, headers: { cookie: "sid=abc" } }, "test");
    const out = lines.join("");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("tok-123");
    expect(out).not.toContain("sid=abc");
    expect(out).toContain("Ama");
  });
});
