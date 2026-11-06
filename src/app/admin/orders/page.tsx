import Link from "next/link";
import { ActionForm } from "@/components/forms/ActionForm";
import { format, money } from "@/lib/money";
import { requirePermission } from "@/server/context";
import { db } from "@/server/db";
import { listOrders, orderCounts } from "@/server/shop/service";
import { cancelOrderAction, markOrderPaidAction } from "../actions";

export const metadata = { title: "Orders" };

const FILTERS = [
  { key: "PENDING_PAYMENT", label: "Waiting for payment" },
  { key: "PAID", label: "Paid" },
  { key: "CANCELLED", label: "Cancelled" },
] as const;

export default async function OrdersAdmin({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const s = await requirePermission("commerce.manage_orders", "/admin/orders");
  const sp = await searchParams;
  const status = FILTERS.find((f) => f.key === sp.status)?.key ?? "PENDING_PAYMENT";
  const [rows, counts] = await Promise.all([listOrders(db(), s.actor, status), orderCounts(db(), s.actor)]);
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Orders</h1>
      <p className="mt-2 max-w-2xl text-sm text-navy/70">
        When a MoMo payment arrives, match it by the reference (TMP-XXXXXX) and amount, then mark the order paid with the MoMo transaction ID. The buyer is emailed and the download unlocks.
      </p>
      <nav aria-label="Order status" className="mt-6 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/admin/orders?status=${f.key}`} className={`rounded-full px-4 py-1.5 ${f.key === status ? "bg-navy text-cream" : "border border-navy/25 hover:border-navy"}`}>
            {f.label} ({counts[f.key] ?? 0})
          </Link>
        ))}
      </nav>
      <ul className="mt-6 space-y-4">
        {rows.map((o) => (
          <li key={o.id} className="rounded-2xl border border-navy/10 bg-white/70 p-5">
            <p className="font-semibold">{o.productTitle} <span className="font-normal text-navy/70">· {format(money(o.amountMinor, "GHS"))}</span></p>
            <p className="mt-1 text-sm">Reference <strong>{o.reference}</strong> · {o.buyerName} ({o.buyerEmail}) · {o.createdAt.toLocaleString("en-GB")}</p>
            {o.status === "PAID" ? <p className="mt-1 text-sm text-green-800">Paid {o.paidAt?.toLocaleString("en-GB")} · transaction: {o.paymentNote}</p> : null}
            {o.status === "PAID" && o.creatorShareMinor !== null && o.platformShareMinor !== null ? (
              <p className="mt-1 text-sm text-navy/80">Split: creator {format(money(o.creatorShareMinor, "GHS"))} · TMP {format(money(o.platformShareMinor, "GHS"))}</p>
            ) : null}
            {o.status === "PENDING_PAYMENT" ? (
              <div className="mt-4 flex flex-wrap items-end gap-6">
                <ActionForm
                  action={markOrderPaidAction}
                  hidden={{ orderId: o.id }}
                  fields={[{ name: "note", label: "MoMo transaction ID", required: true, hint: "From the MoMo confirmation message." }]}
                  submitLabel="Mark as paid"
                />
                <ActionForm action={cancelOrderAction} hidden={{ orderId: o.id }} fields={[]} submitLabel="Cancel order" tone="quiet" />
              </div>
            ) : null}
          </li>
        ))}
        {rows.length === 0 ? <li className="text-navy/70">Nothing here.</li> : null}
      </ul>
    </>
  );
}
