import type { PoolConfig } from "pg";

/** Shared by the app and the CLI scripts so they connect identically. No `server-only`: scripts import it. */
export function poolConfig(opts: { url: string; max: number; ssl?: boolean; rejectUnauthorized?: boolean }): PoolConfig {
  return {
    connectionString: opts.url,
    max: opts.max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Managed Postgres requires TLS. Certificate verification stays ON unless explicitly disabled
    // (Heroku Postgres is the known case where it must be off).
    ssl: opts.ssl ? { rejectUnauthorized: opts.rejectUnauthorized ?? true } : undefined,
  };
}

export const truthy = (v: string | undefined) => v === "true" || v === "1";
