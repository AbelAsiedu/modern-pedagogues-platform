import { sql } from "drizzle-orm";
import type { DbOrTx } from "../db";
import { RateLimitError } from "../errors";

export type RateLimitRule = { key: string; limit: number; windowSeconds: number };
export type RateLimitResult = { allowed: boolean; count: number; retryAfterSeconds: number };

/**
 * Fixed-window counter in PostgreSQL, so limits hold across every app instance.
 * A single atomic upsert both counts and rolls the window; there is no read-then-write race.
 */
export async function consumeRateLimit(db: DbOrTx, rule: RateLimitRule): Promise<RateLimitResult> {
  const result = await db.execute<{ count: number; elapsed: number }>(sql`
    INSERT INTO rate_limits AS r (key, count, window_start)
    VALUES (${rule.key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN r.window_start <= now() - make_interval(secs => ${rule.windowSeconds}::double precision)
                   THEN 1 ELSE r.count + 1 END,
      window_start = CASE WHEN r.window_start <= now() - make_interval(secs => ${rule.windowSeconds}::double precision)
                          THEN now() ELSE r.window_start END
    RETURNING r.count AS count, extract(epoch FROM (now() - r.window_start)) AS elapsed
  `);
  const row = result.rows[0];
  if (!row) throw new Error("rate limiter returned no row");
  const count = Number(row.count);
  const retryAfterSeconds = Math.max(1, Math.ceil(rule.windowSeconds - Number(row.elapsed)));
  return { allowed: count <= rule.limit, count, retryAfterSeconds };
}

export async function enforceRateLimit(db: DbOrTx, rule: RateLimitRule): Promise<void> {
  const r = await consumeRateLimit(db, rule);
  if (!r.allowed) throw new RateLimitError(r.retryAfterSeconds);
}

/** Housekeeping for a scheduled job: drop counters whose window is long over. */
export async function purgeExpiredRateLimits(db: DbOrTx, olderThanSeconds = 86_400): Promise<number> {
  const res = await db.execute(
    sql`DELETE FROM rate_limits WHERE window_start < now() - make_interval(secs => ${olderThanSeconds}::double precision)`,
  );
  return res.rowCount ?? 0;
}
