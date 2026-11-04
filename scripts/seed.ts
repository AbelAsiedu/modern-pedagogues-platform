/** Seed roles, curricula, levels and default settings. Idempotent. Usage: npm run db:seed */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { seedReferenceData } from "../src/server/seed/reference";
import * as schema from "../src/server/db/schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await seedReferenceData(drizzle(pool, { schema }));
    console.log("reference data seeded");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
