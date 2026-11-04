import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 256 bits of randomness, URL-safe. This raw value goes to the user; only its hash is stored. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** High-entropy random tokens do not need a slow hash; SHA-256 makes a database leak useless for impersonation. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
