/**
 * Switch two-step sign-in off for one person who has lost both their phone and their recovery codes.
 * Run by the site owner, never from the website: it needs access to the server.
 * Usage (Heroku): heroku run npm run admin:reset-mfa -- person@example.com -a themodernpedagogues
 * Afterwards the person signs in with their password and sets up two-step sign-in again.
 * Every session they had is ended, and the reset is written to the audit log.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createMfaService } from "../src/server/auth/mfa";
import { emailSchema } from "../src/server/auth/validation";
import { poolConfig, truthy } from "../src/server/db/connection";
import * as schema from "../src/server/db/schema";
import type { Db } from "../src/server/db";
import { createLogger } from "../src/server/logger";

async function main() {
  const [rawEmail] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!rawEmail) throw new Error("Usage: npm run admin:reset-mfa -- person@example.com");
  const email = emailSchema.parse(rawEmail);

  const pool = new Pool(poolConfig({ url, max: 1, ssl: truthy(process.env.DATABASE_SSL), rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }));
  const db = drizzle(pool, { schema }) as unknown as Db;
  try {
    const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
    if (!user) throw new Error(`No account with the email ${email}`);
    await createMfaService({ db, log: createLogger("silent"), key: null }).reset(user.id, "cli");
    console.log(`Two-step sign-in is switched off for ${email}. Their sessions were ended.`);
    console.log("Ask them to sign in with their password and set it up again (Account > Two-step sign-in).");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
