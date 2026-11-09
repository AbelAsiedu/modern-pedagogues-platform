import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, parseEncryptionKey } from "@/server/auth/secret-box";
import {
  RECOVERY_CODE_COUNT,
  base32Decode,
  base32Encode,
  generateRecoveryCode,
  generateTotpSecret,
  groupSecret,
  hotp,
  normaliseRecoveryCode,
  otpauthUri,
  parseSecondFactor,
  totpCode,
  totpStep,
  verifyTotp,
} from "@/server/auth/totp";
import { parseEnv } from "@/server/env";
import { qrModules, qrSvg } from "@/lib/qr";
import { twoStepNotice } from "@/lib/two-step-check";

// RFC 6238 appendix B: the SHA-1 secret is the ASCII string "12345678901234567890".
const RFC_SECRET = base32Encode(new TextEncoder().encode("12345678901234567890"));

describe("TOTP (RFC 6238 test vectors)", () => {
  it("encodes the RFC secret as the base32 every authenticator app expects", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(new TextDecoder().decode(base32Decode(RFC_SECRET))).toBe("12345678901234567890");
  });

  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("matches the RFC code at t=%i", (t, eight) => {
    const secret = base32Decode(RFC_SECRET);
    expect(hotp(secret, Math.floor(t / 30), 8)).toBe(eight);
    expect(totpCode(RFC_SECRET, new Date(t * 1000))).toBe(eight.slice(2)); // our 6 digits are the last 6 of the 8
  });

  it("round-trips base32 and rejects other characters", () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 7]);
    expect(Array.from(base32Decode(base32Encode(bytes)))).toEqual(Array.from(bytes));
    expect(() => base32Decode("not base32!")).toThrow();
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });

  it("accepts one step either side, refuses further, and refuses wrong or malformed codes", () => {
    const at = new Date(1_700_000_000_000);
    const step = totpStep(at);
    const code = (delta: number) => hotp(base32Decode(RFC_SECRET), step + delta);
    expect(verifyTotp(RFC_SECRET, code(0), at, null)).toBe(step);
    expect(verifyTotp(RFC_SECRET, code(-1), at, null)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, code(1), at, null)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, code(2), at, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, code(-2), at, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12345", at, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", at, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "", at, null)).toBeNull();
  });

  it("never accepts a step at or before the last one used (a code cannot be replayed)", () => {
    const at = new Date(1_700_000_000_000);
    const step = totpStep(at);
    const current = hotp(base32Decode(RFC_SECRET), step);
    expect(verifyTotp(RFC_SECRET, current, at, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, current, at, step + 1)).toBeNull();
    expect(verifyTotp(RFC_SECRET, current, at, step - 1)).toBe(step);
    // The older code from the previous step is also dead once the current step has been used.
    expect(verifyTotp(RFC_SECRET, hotp(base32Decode(RFC_SECRET), step - 1), at, step)).toBeNull();
  });

  it("builds the address an authenticator app imports", () => {
    const uri = otpauthUri("The Modern Pedagogues", "ama@example.com", "ABCDEFGH");
    expect(uri).toBe("otpauth://totp/The%20Modern%20Pedagogues:ama%40example.com?secret=ABCDEFGH&issuer=The%20Modern%20Pedagogues");
    expect(groupSecret("ABCDEFGHIJKLMNOP")).toBe("ABCD EFGH IJKL MNOP");
  });
});

describe("recovery codes and code parsing", () => {
  it("makes distinct 10-character codes from an alphabet without look-alike characters", () => {
    const codes = Array.from({ length: 200 }, () => generateRecoveryCode());
    expect(new Set(codes).size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/);
    expect(RECOVERY_CODE_COUNT).toBe(10);
  });

  it("accepts a recovery code however it is typed", () => {
    expect(normaliseRecoveryCode("abcde-fghjk")).toBe("ABCDE-FGHJK");
    expect(normaliseRecoveryCode(" ABCDE FGHJK ")).toBe("ABCDE-FGHJK");
    expect(normaliseRecoveryCode("abcdefghjk")).toBe("ABCDE-FGHJK");
    expect(normaliseRecoveryCode("ABCDE-FGHJ")).toBeNull();
    expect(normaliseRecoveryCode("ABCDE-FGHJ0")).toBeNull(); // 0 is not in the alphabet
    expect(normaliseRecoveryCode("")).toBeNull();
  });

  it("tells a six-digit code from a recovery code, and ignores spaces people add", () => {
    expect(parseSecondFactor("123456")).toEqual({ kind: "totp", code: "123456" });
    expect(parseSecondFactor(" 123 456 ")).toEqual({ kind: "totp", code: "123456" });
    expect(parseSecondFactor("12345")).toBeNull();
    expect(parseSecondFactor("1234567")).toBeNull();
    expect(parseSecondFactor("abcde-fghjk")).toEqual({ kind: "recovery", code: "ABCDE-FGHJK" });
    expect(parseSecondFactor("<script>")).toBeNull();
  });
});

describe("secret box (authenticator seeds are encrypted in the database)", () => {
  const key = Buffer.alloc(32, 9);

  it("round-trips and never stores the plaintext", () => {
    const stored = encryptSecret(key, "JBSWY3DPEHPK3PXP");
    expect(stored).toMatch(/^v1\./);
    expect(stored).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(key, stored)).toBe("JBSWY3DPEHPK3PXP");
    expect(encryptSecret(key, "JBSWY3DPEHPK3PXP")).not.toBe(stored); // fresh nonce each time
  });

  it("returns null for the wrong key, tampering and junk, and never throws", () => {
    const stored = encryptSecret(key, "SECRET");
    expect(decryptSecret(Buffer.alloc(32, 1), stored)).toBeNull();
    const parts = stored.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(decryptSecret(key, parts.join("."))).toBeNull();
    expect(decryptSecret(key, "nonsense")).toBeNull();
    expect(decryptSecret(key, "v2.a.b.c")).toBeNull();
  });

  it("accepts only a 32-byte base64 key", () => {
    expect(parseEncryptionKey(Buffer.alloc(32, 5).toString("base64"))).toHaveLength(32);
    expect(() => parseEncryptionKey(Buffer.alloc(16).toString("base64"))).toThrow();
    expect(() => parseEncryptionKey("")).toThrow();
  });
});

describe("environment", () => {
  const base = { NODE_ENV: "test", APP_URL: "http://localhost:3000", DATABASE_URL: "postgres://x" };

  it("makes the key optional, rejects a malformed one, and requires staff two-step by default", () => {
    const ok = parseEnv(base);
    expect(ok.MFA_ENCRYPTION_KEY).toBeUndefined();
    expect(ok.STAFF_MFA_REQUIRED).toBe(true);
    expect(parseEnv({ ...base, MFA_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64") }).MFA_ENCRYPTION_KEY).toBeTruthy();
    expect(() => parseEnv({ ...base, MFA_ENCRYPTION_KEY: "too-short" })).toThrow(/MFA_ENCRYPTION_KEY/);
    expect(parseEnv({ ...base, STAFF_MFA_REQUIRED: "false" }).STAFF_MFA_REQUIRED).toBe(false);
  });
});

describe("dashboard notice", () => {
  it("asks for the key when there is none, warns when the requirement is off, and is silent otherwise", () => {
    const missing = twoStepNotice(false, true);
    expect(missing?.title).toMatch(/not switched on/);
    expect(missing?.command).toContain("MFA_ENCRYPTION_KEY");
    expect(missing?.command).toContain("randomBytes(32)");
    expect(twoStepNotice(true, false)?.command).toContain("STAFF_MFA_REQUIRED");
    expect(twoStepNotice(true, true)).toBeNull();
  });
});

describe("QR generator", () => {
  it("is deterministic, square, and has the three finder squares", () => {
    const a = qrModules("otpauth://totp/TMP:ama%40example.com?secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567&issuer=TMP");
    const b = qrModules("otpauth://totp/TMP:ama%40example.com?secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567&issuer=TMP");
    expect(a).toEqual(b);
    const n = a.length;
    expect((n - 17) % 4).toBe(0);
    for (const row of a) expect(row).toHaveLength(n);
    // The 7x7 finder pattern in each of three corners: dark ring, light ring, dark 3x3 centre.
    for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]] as const) {
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 7; x++) {
          const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
          expect(a[oy + y]![ox + x]).toBe(ring !== 2);
        }
      }
    }
    expect(a[n - 8]![8]).toBe(true); // the always-dark module
  });

  it("grows with the text and refuses what it cannot hold", () => {
    expect(qrModules("A").length).toBe(21);
    expect(qrModules("x".repeat(100)).length).toBeGreaterThan(21);
    expect(qrModules("x".repeat(213)).length).toBe(57);
    expect(() => qrModules("x".repeat(214))).toThrow(/too long/);
  });

  it("renders SVG made only of numbers and path commands", () => {
    const { svg, modules } = qrSvg("hello");
    expect(modules).toBe(21);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 29 29"/);
    expect(svg).not.toMatch(/<script|onload|href/i);
    expect(svg.match(/d="([^"]*)"/)![1]).toMatch(/^[MhvzM0-9 \-]+$/);
  });
});
