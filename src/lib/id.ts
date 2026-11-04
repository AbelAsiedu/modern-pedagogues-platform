import { randomBytes } from "node:crypto";

/**
 * UUID version 7 (RFC 9562): 48-bit unix-millisecond timestamp, then random bits.
 * Time-ordered ids keep primary-key indexes append-mostly, which matters for the large
 * audit, payment and ledger tables. PostgreSQL 16 has no native uuidv7(), so we generate in the app.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);

  // 48-bit big-endian timestamp.
  bytes[0] = Math.floor(now / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(now / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(now / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(now / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;

  // Version 7 and RFC 4122 variant bits.
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
