import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { consumeRateLimit, purgeExpiredRateLimits } from "@/server/auth/rate-limit";
import { recordAudit } from "@/server/audit";
import { siteSettings, users } from "@/server/db/schema";
import { seedReferenceData } from "@/server/seed/reference";
import { openTestDb, resetData } from "../support/harness";

const { pool, db } = openTestDb();
afterAll(() => pool.end());
beforeEach(() => resetData(db));

describe("audit log is append-only at the database level", () => {
  it("accepts inserts", async () => {
    await recordAudit(db, { action: "test.inserted", entityType: "test", entityId: "1", metadata: { a: 1 } });
    const r = await db.execute<{ n: number }>(sql`select count(*)::int n from audit_logs where action = 'test.inserted'`);
    expect(r.rows[0]!.n).toBeGreaterThanOrEqual(1);
  });
  it("rejects UPDATE, DELETE and TRUNCATE, even from application code", async () => {
    await recordAudit(db, { action: "test.immutable", entityType: "test" });
    // Drizzle wraps driver errors; the PostgreSQL message from our trigger is on `cause`.
    const reason = async (p: Promise<unknown>) => {
      try {
        await p;
      } catch (e) {
        return String((e as { cause?: { message?: string } }).cause?.message ?? e);
      }
      return "NOT REJECTED";
    };
    expect(await reason(db.execute(sql`update audit_logs set action = 'tampered'`))).toMatch(/append-only/);
    expect(await reason(db.execute(sql`delete from audit_logs`))).toMatch(/append-only/);
    expect(await reason(db.execute(sql`truncate audit_logs`))).toMatch(/append-only/);
  });
  it("re-enables the triggers after the test harness wipes data", async () => {
    await resetData(db);
    await recordAudit(db, { action: "test.after_reset", entityType: "test" });
    await expect(db.execute(sql`delete from audit_logs`)).rejects.toThrow();
  });
  it("blocks hard-deleting a user who has audit history", async () => {
    const [u] = await db.insert(users).values({ email: "audited@example.com", fullName: "A" }).returning({ id: users.id });
    await recordAudit(db, { actorId: u!.id, action: "test.actor", entityType: "test" });
    await expect(db.delete(users).where(sql`id = ${u!.id}`)).rejects.toThrow();
  });
});

describe("constraints", () => {
  it("rejects non-normalised emails at the database", async () => {
    await expect(db.insert(users).values({ email: "Mixed@Case.com", fullName: "X" })).rejects.toThrow();
  });
  it("rejects duplicate emails", async () => {
    await db.insert(users).values({ email: "a@example.com", fullName: "A" });
    await expect(db.insert(users).values({ email: "a@example.com", fullName: "B" })).rejects.toThrow();
  });
  it("assigns time-ordered UUIDv7 primary keys in the application", async () => {
    const [a] = await db.insert(users).values({ email: "1@example.com", fullName: "A" }).returning({ id: users.id });
    expect(a!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("rate limiter", () => {
  const rule = { key: "t:1", limit: 3, windowSeconds: 60 };
  it("allows up to the limit then blocks, with a retry-after", async () => {
    for (let i = 1; i <= 3; i++) expect((await consumeRateLimit(db, rule)).allowed).toBe(true);
    const blocked = await consumeRateLimit(db, rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });
  it("keeps keys independent", async () => {
    for (let i = 0; i < 5; i++) await consumeRateLimit(db, rule);
    expect((await consumeRateLimit(db, { ...rule, key: "t:2" })).allowed).toBe(true);
  });
  it("is atomic under concurrency", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => consumeRateLimit(db, { ...rule, limit: 5 })));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });
  it("starts a new window once the old one has elapsed", async () => {
    await consumeRateLimit(db, rule);
    await db.execute(sql`update rate_limits set window_start = now() - interval '2 minutes' where key = 't:1'`);
    const r = await consumeRateLimit(db, rule);
    expect(r.count).toBe(1);
  });
  it("purges stale counters", async () => {
    await consumeRateLimit(db, rule);
    await db.execute(sql`update rate_limits set window_start = now() - interval '2 days'`);
    expect(await purgeExpiredRateLimits(db)).toBe(1);
  });
});

describe("seed data", () => {
  it("is idempotent and never overwrites an admin's setting change", async () => {
    await db
      .update(siteSettings)
      .set({ value: { amountMinor: "15000", currency: "GHS", unit: "session", negotiable: true } as never })
      .where(sql`key = 'tutoring.indicative_rate'`);
    await seedReferenceData(db);
    await seedReferenceData(db);
    const counts = await db.execute<{ roles: number; cur: number; lvl: number }>(
      sql`select (select count(*)::int from roles) roles, (select count(*)::int from curricula) cur, (select count(*)::int from academic_levels) lvl`,
    );
    expect(counts.rows[0]).toEqual({ roles: 10, cur: 5, lvl: 6 });
    const rate = await db.select().from(siteSettings).where(sql`key = 'tutoring.indicative_rate'`);
    expect((rate[0]!.value as { amountMinor: string }).amountMinor).toBe("15000");
    const commission = await db.select().from(siteSettings).where(sql`key = 'marketplace.commission'`);
    expect(commission[0]!.value).toEqual({ commissionBps: 3000, processingFeeBearer: "platform" });
  });
});
