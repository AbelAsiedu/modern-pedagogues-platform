import { createHmac, randomBytes, randomInt } from "node:crypto";

/**
 * Time-based one-time passwords (RFC 6238) as used by Google Authenticator, Microsoft Authenticator,
 * Authy, 1Password and similar apps. SHA-1, 6 digits, 30-second steps: the combination every app supports.
 * Pure functions with no database access, so they are unit-tested against the RFC's own test vectors.
 */

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Codes from one step either side of now are accepted, to forgive a phone clock that is a few seconds out. */
export const TOTP_WINDOW = 1;

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("not base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** 160 random bits, the length RFC 4226 recommends for SHA-1. Returned base32 encoded, as apps expect. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226) for one counter value. */
export function hotp(secret: Uint8Array, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const offset = h[h.length - 1]! & 0x0f;
  const bin =
    ((h[offset]! & 0x7f) << 24) | (h[offset + 1]! << 16) | (h[offset + 2]! << 8) | h[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const totpStep = (at: Date): number => Math.floor(at.getTime() / 1000 / TOTP_STEP_SECONDS);

export function totpCode(secretBase32: string, at: Date, digits = TOTP_DIGITS): string {
  return hotp(base32Decode(secretBase32), totpStep(at), digits);
}

/** Constant-shape comparison of two equal-length digit strings. */
function sameDigits(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Check a code against the current step and its neighbours. Returns the step that matched, or null.
 * `afterStep` is the last step already accepted for this user: a code from that step or earlier is refused,
 * so a code cannot be used twice (someone who watched it being typed gets nothing).
 */
export function verifyTotp(secretBase32: string, code: string, at: Date, afterStep: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const now = totpStep(at);
  let matched: number | null = null;
  // No early exit: every candidate step is compared, so timing does not reveal which one was close.
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    const step = now + delta;
    if (sameDigits(hotp(secret, step), code) && (afterStep === null || step > afterStep) && matched === null) matched = step;
  }
  return matched;
}

/** The address an authenticator app imports. Defaults (SHA-1, 6 digits, 30 s) are left out to keep the QR code small. */
export function otpauthUri(issuer: string, account: string, secretBase32: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}`;
}

/** Spaced in fours so a person can type it into an app by hand. */
export const groupSecret = (secret: string): string => secret.replace(/(.{4})/g, "$1 ").trim();

// ---- Recovery codes -------------------------------------------------------------------------------------------

/** No 0/O/1/I/L: codes get written on paper and read back. */
const RECOVERY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const RECOVERY_CODE_COUNT = 10;
const RECOVERY_HALF = 5;

/** "ABCDE-FGHJK": 10 characters from a 31-letter alphabet, about 49 bits each. */
export function generateRecoveryCode(): string {
  let s = "";
  for (let i = 0; i < RECOVERY_HALF * 2; i++) s += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
  return `${s.slice(0, RECOVERY_HALF)}-${s.slice(RECOVERY_HALF)}`;
}

/** Accepts what people actually type: any case, spaces, a missing or extra hyphen. Returns the canonical form or null. */
export function normaliseRecoveryCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, "");
  if (s.length !== RECOVERY_HALF * 2) return null;
  for (const ch of s) if (!RECOVERY_ALPHABET.includes(ch)) return null;
  return `${s.slice(0, RECOVERY_HALF)}-${s.slice(RECOVERY_HALF)}`;
}

/** What the person typed into the "code" box, classified. */
export type ParsedCode = { kind: "totp"; code: string } | { kind: "recovery"; code: string } | null;

export function parseSecondFactor(input: string): ParsedCode {
  const trimmed = input.trim();
  const digits = trimmed.replace(/[\s-]/g, "");
  if (/^\d{6}$/.test(digits)) return { kind: "totp", code: digits };
  const recovery = normaliseRecoveryCode(trimmed);
  return recovery ? { kind: "recovery", code: recovery } : null;
}
