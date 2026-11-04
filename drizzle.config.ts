import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` only diffs the TypeScript schema against previous snapshots and writes SQL;
// it needs no database. Applying migrations is done by scripts/migrate.ts (forward-only, transactional).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
