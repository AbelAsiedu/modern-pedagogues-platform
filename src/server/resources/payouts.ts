import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { format, money, parseDecimal } from "../../lib/money";
import { recordAudit } from "../audit";
import { parseOrThrow } from "../auth/validation";
import type { Db } from "../db";
import { creatorPayouts, creatorProfiles, users } from "../db/schema";
import { deliverEmail } from "../email/deliver";
import { payoutRecordedMessage } from "../email/templates";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { assertCan, can, type Actor } from "../permissions/authorize";
import type { DeliverDeps } from "../email/deliver";
import { balanceFor } from "./creators";

/** Creators with what they have earned, been paid, and are still owed. Visible to finance and to creator managers. */
export async function listCreatorBalances(db: Db, actor: Actor | null) {
  if (!can(actor, "finance.manage_payouts") && !can(actor, "marketplace.manage_creators")) assertCan(actor, "finance.manage_payouts");
  const rows = await db
    .select({
      userId: creatorProfiles.userId,
      name: creatorProfiles.displayName,
      email: users.email,
      payoutPhone: creatorProfiles.payoutPhone,
      suspended: creatorProfiles.isSuspended,
      earned: sql<string>`coalesce((SELECT sum(creator_share_minor) FROM orders o WHERE o.creator_id = ${creatorProfiles.userId} AND o.status = 'PAID'), 0)::text`,
      paid: sql<string>`coalesce((SELECT sum(amount_minor) FROM creator_payouts p WHERE p.creator_id = ${creatorProfiles.userId}), 0)::text`,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .orderBy(creatorProfiles.displayName);
  return rows.map((r) => ({ ...r, earned: BigInt(r.earned), paid: BigInt(r.paid), balance: BigInt(r.earned) - BigInt(r.paid) }));
}

const payoutInput = z.object({
  amount: z.string().trim(),
  reference: z.string().trim().min(4, "Enter the MoMo transaction ID of the payout.").max(80),
});

/** Record money sent to a creator. Cannot exceed what they are owed (checked under a row lock, so two clicks cannot overpay). */
export async function recordPayout(deps: DeliverDeps & { appUrl: string }, actor: Actor | null, creatorId: string, input: unknown, ip?: string | null) {
  assertCan(actor, "finance.manage_payouts");
  const data = parseOrThrow(payoutInput, input);
  let pesewas: bigint;
  try {
    pesewas = parseDecimal(data.amount, "GHS").amount;
  } catch {
    throw new ValidationError({ amount: ["Enter the amount in cedis, for example 150 or 150.50."] }, "bad amount");
  }
  if (pesewas <= 0n) throw new ValidationError({ amount: ["The amount must be more than zero."] }, "bad amount");
  const { db } = deps;
  await db.transaction(async (tx) => {
    const [lock] = await tx.select({ id: creatorProfiles.userId }).from(creatorProfiles).where(eq(creatorProfiles.userId, creatorId)).for("update").limit(1);
    if (!lock) throw new NotFoundError("creator not found");
    const { balance } = await balanceFor(tx as unknown as Db, creatorId);
    if (pesewas > balance) throw new ConflictError(`That is more than the creator is owed (${format(money(balance, "GHS"))}).`);
    await tx.insert(creatorPayouts).values({ creatorId, amountMinor: pesewas, reference: data.reference, paidById: actor.id });
    await recordAudit(tx, { actorId: actor.id, action: "creator.payout_recorded", entityType: "user", entityId: creatorId, metadata: { amountMinor: pesewas.toString() }, ip });
  });
  const [c] = await db.select({ email: users.email, name: creatorProfiles.displayName }).from(creatorProfiles).innerJoin(users, eq(users.id, creatorProfiles.userId)).where(eq(creatorProfiles.userId, creatorId)).limit(1);
  if (c) await deliverEmail(deps, payoutRecordedMessage(c.email, c.name, format(money(pesewas, "GHS")), data.reference));
}

export async function listPayouts(db: Db, actor: Actor | null, creatorId: string) {
  assertCan(actor, "finance.manage_payouts");
  return db.select({ id: creatorPayouts.id, amountMinor: creatorPayouts.amountMinor, reference: creatorPayouts.reference, createdAt: creatorPayouts.createdAt }).from(creatorPayouts).where(eq(creatorPayouts.creatorId, creatorId)).orderBy(desc(creatorPayouts.createdAt));
}

/** A suspended creator cannot upload or submit; their approved resources stay as they are unless staff take them down. */
export async function setCreatorSuspended(db: Db, actor: Actor | null, creatorId: string, suspended: boolean, ip?: string | null) {
  assertCan(actor, "marketplace.manage_creators");
  const res = await db.update(creatorProfiles).set({ isSuspended: suspended }).where(eq(creatorProfiles.userId, creatorId)).returning({ id: creatorProfiles.userId });
  if (res.length === 0) throw new NotFoundError("creator not found");
  await recordAudit(db, { actorId: actor.id, action: suspended ? "creator.suspended" : "creator.restored", entityType: "user", entityId: creatorId, ip });
}

