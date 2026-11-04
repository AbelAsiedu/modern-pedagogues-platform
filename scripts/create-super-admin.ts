/**
 * Create the first super administrator without ever handling a password.
 * The account is created ACTIVE with no password; a one-time, one-hour password-set link is printed
 * for the operator to open. Usage: npm run admin:create -- you@example.com "Full Name"
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { recordAudit } from "../src/server/audit";
import { RESET_TTL_SECONDS } from "../src/server/auth/service";
import { generateToken, hashToken } from "../src/server/auth/tokens";
import { emailSchema } from "../src/server/auth/validation";
import * as schema from "../src/server/db/schema";
import { seedReferenceData } from "../src/server/seed/reference";

async function main() {
  const [rawEmail, fullName] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!rawEmail || !fullName) throw new Error('Usage: npm run admin:create -- you@example.com "Full Name"');
  const email = emailSchema.parse(rawEmail);

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema });
  try {
    await seedReferenceData(db);
    const token = generateToken();
    await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
      let userId = existing?.id;
      if (!userId) {
        const [u] = await tx
          .insert(schema.users)
          .values({ email, fullName, status: "ACTIVE", emailVerifiedAt: new Date() })
          .returning({ id: schema.users.id });
        userId = u!.id;
      }
      const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "super_admin"));
      await tx.insert(schema.userRoles).values({ userId, roleId: role!.id }).onConflictDoNothing();
      await tx.insert(schema.passwordResetTokens).values({
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_SECONDS * 1000),
      });
      await recordAudit(tx, { action: "admin.super_admin_bootstrapped", entityType: "user", entityId: userId, metadata: { via: "cli" } });
    });
    console.log(`Super administrator ready: ${email}`);
    console.log(`Set the password within 1 hour: ${appUrl}/reset-password?token=${token}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
