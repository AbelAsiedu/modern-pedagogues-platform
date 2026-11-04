import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Integration tests run against a real PostgreSQL database, never mocks. This resets the schema and
 * applies every migration, so the tests also prove the migrations work from an empty database.
 * It fails loudly when no database is configured rather than silently skipping.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Integration tests need a disposable PostgreSQL database (see README, 'Running tests').",
    );
  }
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!/_test$/.test(dbName)) {
    throw new Error(`Refusing to reset database "${dbName}": the name must end in _test.`);
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("CREATE SCHEMA public");
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}
