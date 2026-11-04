import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db";
import { createAuthService } from "@/server/auth/service";
import { MemoryMailer, extractLink } from "@/server/email/mailer";
import { createLogger } from "@/server/logger";
import { seedReferenceData } from "@/server/seed/reference";

export function openTestDb() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 4 });
  const db = drizzle(pool, { schema }) as unknown as Db;
  return { pool, db };
}

/**
 * Wipe every table between tests. audit_logs is append-only, so its triggers are disabled for the
 * duration of the wipe (test database only; the audit tests prove they are re-enabled afterwards).
 */
export async function resetData(db: Db) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`ALTER TABLE audit_logs DISABLE TRIGGER USER`);
    await tx.execute(sql`TRUNCATE users, roles, user_roles, sessions, email_verification_tokens, password_reset_tokens,
      rate_limits, email_deliveries, site_settings, curricula, academic_levels, subjects, audit_logs`);
    await tx.execute(sql`ALTER TABLE audit_logs ENABLE TRIGGER USER`);
  });
  await seedReferenceData(db);
}

export function makeAuth(db: Db, clock?: { now: Date }) {
  const mailer = new MemoryMailer();
  const auth = createAuthService({
    db,
    mailer,
    log: createLogger("silent"),
    appUrl: "http://localhost:3000",
    now: clock ? () => new Date(clock.now) : undefined,
  });
  const tokenFromLast = () => {
    const link = extractLink(mailer.last()?.text ?? "");
    if (!link) throw new Error("no link in last email");
    return new URL(link).searchParams.get("token")!;
  };
  return { auth, mailer, tokenFromLast };
}

export const GOOD_PASSWORD = "correct horse battery staple";
export const newUser = (email = "ama@example.com", role: "student" | "parent" = "parent") => ({
  email,
  fullName: "Ama Mensah",
  password: GOOD_PASSWORD,
  role,
});
