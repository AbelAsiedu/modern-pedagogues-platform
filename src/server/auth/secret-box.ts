import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypts small secrets (the authenticator seed) before they reach the database, so a copy of the database
 * on its own cannot be used to generate login codes. AES-256-GCM with a fresh random nonce each time; the key
 * lives only in the server environment (MFA_ENCRYPTION_KEY), never in the database or the code.
 *
 * Stored form: "v1.<nonce>.<tag>.<ciphertext>", each part base64url.
 */

const VERSION = "v1";

/** Parse the key setting: base64 (or base64url) text that decodes to exactly 32 bytes. */
export function parseEncryptionKey(text: string): Buffer {
  const key = Buffer.from(text.trim(), "base64");
  if (key.length !== 32) throw new Error("MFA_ENCRYPTION_KEY must be 32 random bytes encoded as base64");
  return key;
}

export function encryptSecret(key: Buffer, plaintext: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, nonce.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

/** Returns null (never throws) when the value is damaged or was encrypted with a different key. */
export function decryptSecret(key: Buffer, stored: string): string | null {
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1]!, "base64url"));
    decipher.setAuthTag(Buffer.from(parts[2]!, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(parts[3]!, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
