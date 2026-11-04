import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "../../../lib/id";

/** Shared column helpers: UUIDv7 primary keys, UTC timestamps with millisecond precision. */
export const id = () =>
  uuid("id")
    .primaryKey()
    .defaultRandom()
    .$defaultFn(() => uuidv7());

export const ts = (name: string) => timestamp(name, { withTimezone: true, precision: 3, mode: "date" });

export const createdAt = () => ts("created_at").notNull().defaultNow();

export const userStatus = pgEnum("user_status", ["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED"]);

export const users = pgTable(
  "users",
  {
    id: id(),
    /** Stored lowercase and trimmed; uniqueness is enforced on this normalised value. */
    email: text("email").notNull().unique(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    /** Null until the user sets a password (admin-created or future OAuth-only accounts). */
    passwordHash: text("password_hash"),
    status: userStatus("status").notNull().default("PENDING_VERIFICATION"),
    emailVerifiedAt: ts("email_verified_at"),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: ts("locked_until"),
    lastLoginAt: ts("last_login_at"),
    suspendedAt: ts("suspended_at"),
    suspensionReason: text("suspension_reason"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("users_status_idx").on(t.status),
    check("users_email_normalised", sql`${t.email} = lower(btrim(${t.email}))`),
  ],
);

/**
 * Roles are rows so users can be assigned to them; what each role may do lives in code
 * (src/server/permissions/catalog.ts) so permissions are versioned, reviewed and tested together.
 */
export const roles = pgTable("roles", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isStaff: boolean("is_staff").notNull().default(false),
  createdAt: createdAt(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    assignedById: uuid("assigned_by_id").references(() => users.id, { onDelete: "set null" }),
    assignedAt: ts("assigned_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] }), index("user_roles_role_idx").on(t.roleId)],
);

/** Only a SHA-256 hash of the session token is stored; the raw token exists only in the user's cookie. */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: createdAt(),
    lastUsedAt: ts("last_used_at").notNull().defaultNow(),
    /** Idle expiry, pushed forward on use but never beyond absoluteExpiresAt. */
    expiresAt: ts("expires_at").notNull(),
    absoluteExpiresAt: ts("absolute_expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("email_verification_tokens_user_idx").on(t.userId)],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("password_reset_tokens_user_idx").on(t.userId)],
);

/** Fixed-window counters shared across app instances. The caller supplies an already namespaced key. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    windowStart: ts("window_start").notNull(),
  },
  (t) => [
    index("rate_limits_window_idx").on(t.windowStart),
    check("rate_limits_count_non_negative", sql`${t.count} >= 0`),
  ],
);
