import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/forms/ActionForm";
import { RichText } from "@/components/site/RichText";
import { format, money } from "@/lib/money";
import { getSiteText, requireSession } from "@/server/context";
import { db } from "@/server/db";
import { listMyOrders } from "@/server/shop/service";
import { paystackConfig } from "@/server/context";
import { cancelMyOrderAction, payWithPaystackAction } from "../../resources/actions";

export const metadata: Metadata = { title: "My orders", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS = { PENDING_PAYMENT: "Waiting for payment", PAID: "Paid", CANCELLED: "Cancelled" } as const;
const BADGE = { PENDING_PAYMENT: "bg-amber-100 text-amber-900", PAID: "bg-green-100 text-green-900", CANCELLED: "bg-navy/10" } as const;

const PAYMENT_BANNER: Record<string, { tone: string; text: string }> = {
  paid: { tone: "bg-green-100 text-green-900", text: "Payment received. Your download is ready below." },
  pending: { tone: "bg-amber-100 text-amber-900", text: "We have not had confirmation from Paystack yet. If you approved the payment on your phone, give it a minute and refresh this page; your download unlocks by itself." },
  failed: { tone: "bg-red-100 text-red-900", text: "The payment did not go through, and you have not been charged for it. You can try again below." },
  check: { tone: "bg-amber-100 text-amber-900", text: "Paystack reported a payment that does not match this order, so we have not unlocked it. Please contact us with your order reference." },
};

export default async function MyOrders({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const banner = PAYMENT_BANNER[(await searchParams).payment ?? ""];
  const online = paystackConfig() !== null;
  const s = await requireSession("/account/orders");
  const [orders, t] = await Promise.all([listMyOrders(db(), s.actor), getSiteText()]);
  const hasPending = orders.some((o) => o.status === "PENDING_PAYMENT");
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/account" className="text-sm underline">← My account</Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">My orders</h1>

      {banner ? <p role="status" className={`mt-6 rounded-xl p-4 text-sm ${banner.tone}`}>{banner.text}</p> : null}

      {hasPending ? (
        <section className="mt-6 rounded-2xl border border-gold/50 bg-cream-deep p-5">
          {online ? <p className="mb-3 text-sm font-semibold">Pay securely online with Mobile Money or a card using the Pay now button on your order. Paystack confirms it for us and your download unlocks straight away. You can also pay by hand:</p> : null}
          <h2 className="text-lg font-semibold">{t.text("shop.pay.heading")}</h2>
          <div className="mt-2 [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-6"><RichText text={t.lines("shop.pay.steps").map((l) => `- ${l}`).join("\n")} /></div>
        </section>
      ) : null}

      <ul className="mt-8 space-y-4">
        {orders.map((o) => (
          <li key={o.id} className="rounded-2xl border border-navy/10 bg-white/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">{o.productTitle}</p>
              <span className={`rounded-full px-3 py-1 text-xs ${BADGE[o.status]}`}>{STATUS[o.status]}</span>
            </div>
            <p className="mt-2 text-sm text-navy/80">
              {format(money(o.amountMinor, "GHS"))} · Reference <strong>{o.reference}</strong> · Ordered {o.createdAt.toLocaleDateString("en-GB")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              {o.status === "PAID" ? (
                <a href={`/api/downloads/${o.id}`} className="rounded-full bg-royal px-5 py-2 text-sm font-semibold text-cream hover:bg-royal-deep">Download PDF</a>
              ) : null}
              {o.status === "PENDING_PAYMENT" && online ? (
                <ActionForm className="inline" action={payWithPaystackAction} hidden={{ orderId: o.id }} fields={[]} submitLabel="Pay now" />
              ) : null}
              {o.status === "PENDING_PAYMENT" ? (
                <ActionForm className="inline" action={cancelMyOrderAction} hidden={{ orderId: o.id }} fields={[]} submitLabel="Cancel order" tone="quiet" />
              ) : null}
            </div>
          </li>
        ))}
        {orders.length === 0 ? (
          <li className="text-navy/70">
            You have no orders yet. <Link href="/resources" className="font-semibold underline decoration-gold underline-offset-4">Browse the resources</Link>.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
