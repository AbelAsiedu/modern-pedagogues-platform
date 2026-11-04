import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query surface as the database handle. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { __tmpPool?: Pool };

function createPool(): Pool {
  const e = env();
  return new Pool({
    connectionString: e.DATABASE_URL,
    max: e.DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Managed Postgres providers require TLS; local development usually does not.
    ssl: e.DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
  });
}

/** One pool per process (reused across hot reloads in development). */
export function getPool(): Pool {
  if (!globalForDb.__tmpPool) globalForDb.__tmpPool = createPool();
  return globalForDb.__tmpPool;
}

let cached: Db | undefined;
export function db(): Db {
  if (!cached) cached = drizzle(getPool(), { schema });
  return cached;
}

export { schema };
