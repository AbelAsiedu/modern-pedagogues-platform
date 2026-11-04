/**
 * Apply pending SQL migrations from ./drizzle. Forward-only: there is no "down".
 * Each migration runs in a transaction; a failure leaves the database at the previous version.
 * Usage: npm run db:migrate   (reads DATABASE_URL from the environment or .env)
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { poolConfig, truthy } from "../src/server/db/connection";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool(poolConfig({ url, max: 1, ssl: truthy(process.env.DATABASE_SSL), rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }));
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("migrations applied");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
