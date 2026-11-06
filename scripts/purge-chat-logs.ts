/**
 * Housekeeping: delete Kaitlyn chat logs past the retention period and stale rate-limit counters.
 * Run daily, for example with Heroku Scheduler: npm run assistant:purge
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { purgeExpiredRateLimits } from "../src/server/auth/rate-limit";
import { purgeOldChatLogs } from "../src/server/assistant/service";
import { poolConfig, truthy } from "../src/server/db/connection";
import * as schema from "../src/server/db/schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool(poolConfig({ url, max: 1, ssl: truthy(process.env.DATABASE_SSL), rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }));
  try {
    const db = drizzle(pool, { schema });
    console.log(`chat logs deleted: ${await purgeOldChatLogs(db)}`);
    console.log(`rate-limit counters deleted: ${await purgeExpiredRateLimits(db)}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
