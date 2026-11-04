import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

/**
 * Argon2id (the library default) with the OWASP-recommended minimum profile:
 * 19 MiB memory, 2 iterations, 1 lane. Raise memoryCost as hosting allows.
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    // A malformed stored hash must never authenticate anyone.
    return false;
  }
}

let dummy: Promise<string> | undefined;
/**
 * Verify against a throwaway hash so "no such user" costs the same as "wrong password".
 * Always returns false.
 */
export async function verifyAgainstDummy(plain: string): Promise<false> {
  dummy ??= hashPassword("tmp-dummy-password-not-a-real-credential");
  await verifyPassword(await dummy, plain);
  return false;
}

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/** Length-based policy (NIST SP 800-63B): no composition rules, but a sensible minimum and a cap to bound hashing cost. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`)
  .refine((p) => p.trim().length > 0, "Password cannot be only spaces.");
