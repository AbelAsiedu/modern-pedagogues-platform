import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { auditLogs, users } from "../db/schema";
import { can, type Actor } from "../permissions/authorize";
import { listCreatorBalances } from "../resources/payouts";

export type Tile = { key: string; label: string; value: number | string; href: string; hint?: string; tone?: "alert" | "ok" | "plain" };
export type RecentEvent = { id: string; action: string; actorName: string | null; at: Date };

/**
 * What needs attention, and the headline numbers, limited to what this actor is allowed to see.
 * Each figure is one cheap count; nothing here changes data.
 */
export async function adminOverview(db: Db, actor: Actor | null): Promise<{ attention: Tile[]; numbers: Tile[]; recent: RecentEvent[] }> {
  const attention: Tile[] = [];
  const numbers: Tile[] = [];

  const count = async (query: ReturnType<typeof sql>) => (await db.execute<{ n: number }>(query)).rows[0]?.n ?? 0;

  if (can(actor, "tutors.review_applications")) {
    const n = await count(sql`select count(*)::int n from tutor_profiles where status = 'PENDING'`);
    attention.push({ key: "tutors", label: "Tutor applications waiting", value: n, href: "/admin/tutors", tone: n > 0 ? "alert" : "ok", hint: n > 0 ? "Review and approve" : "All caught up" });
    const live = await count(sql`select count(*)::int n from tutor_profiles where status = 'APPROVED' and is_published`);
    numbers.push({ key: "tutors_live", label: "Tutors on the website", value: live, href: "/admin/tutors" });
  }
  if (can(actor, "marketplace.moderate")) {
    const n = await count(sql`select count(*)::int n from products where status = 'IN_REVIEW'`);
    attention.push({ key: "review", label: "Resources to review", value: n, href: "/admin/review", tone: n > 0 ? "alert" : "ok", hint: n > 0 ? "Creators are waiting" : "Queue is empty" });
  }
  if (can(actor, "commerce.manage_orders")) {
    const n = await count(sql`select count(*)::int n from orders where status = 'PENDING_PAYMENT'`);
    attention.push({ key: "orders", label: "Orders awaiting payment", value: n, href: "/admin/orders", tone: n > 0 ? "alert" : "ok", hint: n > 0 ? "Confirm when MoMo arrives" : "Nothing pending" });
    const paid = await count(sql`select count(*)::int n from orders where status = 'PAID'`);
    numbers.push({ key: "orders_paid", label: "Paid orders", value: paid, href: "/admin/orders" });
  }
  if (can(actor, "finance.manage_payouts") || can(actor, "marketplace.manage_creators")) {
    const owed = (await listCreatorBalances(db, actor)).filter((c) => c.balance > 0n).length;
    attention.push({ key: "payouts", label: "Creators owed a payout", value: owed, href: "/admin/creators", tone: owed > 0 ? "alert" : "ok", hint: owed > 0 ? "Record payouts" : "Everyone is paid" });
  }
  if (can(actor, "commerce.manage_products")) {
    const live = await count(sql`select count(*)::int n from products where status = 'APPROVED' and is_published`);
    numbers.push({ key: "resources_live", label: "Resources on sale", value: live, href: "/admin/shop" });
  }
  if (can(actor, "content.manage_site")) {
    const live = await count(sql`select count(*)::int n from hero_banners where is_active`);
    numbers.push({ key: "slides", label: "Slides in the home slideshow", value: live, href: "/admin/banners" });
  }
  if (can(actor, "users.view")) {
    const n = await count(sql`select count(*)::int n from users`);
    numbers.push({ key: "users", label: "Registered users", value: n, href: "/admin/users" });
  }

  let recent: RecentEvent[] = [];
  if (can(actor, "audit.view")) {
    recent = await db
      .select({ id: auditLogs.id, action: auditLogs.action, actorName: users.fullName, at: auditLogs.createdAt })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(8);
  }
  return { attention, numbers, recent };
}
