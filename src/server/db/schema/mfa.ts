import { bigint, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, ts, users } from "./identity";

/**
 * Two-step sign-in (authenticator app). One row per user who has started setting it up.
 * `confirmedAt` is null until the user proves their app works by entering a code; only then is it enforced.
 * The seed is stored encrypted (see src/server/auth/secret-box.ts), never in plain text.
 */
export const userMfa = pgTable("user_mfa", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  secretEnc: text("secret_enc").notNull(),
  confirmedAt: ts("confirmed_at"),
  /** The last 30-second step whose code was accepted. A code from that step or earlier is refused, so no code works twice. */
  lastStep: bigint("last_step", { mode: "number" }),
  createdAt: createdAt(),
});

/** One-time codes for when the phone is lost. Only a SHA-256 hash is stored. */
export const mfaRecoveryCodes = pgTable(
  "mfa_recovery_codes",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull().unique(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("mfa_recovery_codes_user_idx").on(t.userId)],
);

/**
 * Between "password correct" and "code correct". No session exists yet; this short-lived, single-use row is what the
 * second sign-in step presents. Five wrong codes destroy it, so the password has to be entered again.
 */
export const mfaChallenges = pgTable(
  "mfa_challenges",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("mfa_challenges_user_idx").on(t.userId), index("mfa_challenges_expires_idx").on(t.expiresAt)],
);
