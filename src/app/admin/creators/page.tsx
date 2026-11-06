import { ActionForm } from "@/components/forms/ActionForm";
import { format, money } from "@/lib/money";
import { requireSession } from "@/server/context";
import { db } from "@/server/db";
import { can } from "@/server/permissions/authorize";
import { listCreatorBalances, listPayouts } from "@/server/resources/payouts";
import { notFound } from "next/navigation";
import { recordPayoutAction, setCreatorSuspendedAction } from "../actions";

export const metadata = { title: "Creators" };
export const dynamic = "force-dynamic";

const gh = (n: bigint) => format(money(n, "GHS"));

export default async function CreatorsAdmin() {
  const s = await requireSession("/admin/creators");
  const canPay = can(s.actor, "finance.manage_payouts");
  const canManage = can(s.actor, "marketplace.manage_creators");
  if (!canPay && !canManage) notFound();
  const rows = await listCreatorBalances(db(), s.actor);
  const payouts = canPay ? Object.fromEntries(await Promise.all(rows.map(async (r) => [r.userId, await listPayouts(db(), s.actor, r.userId)] as const))) : {};
  const owed = rows.reduce((a, r) => a + r.balance, 0n);
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Creators</h1>
      <p className="mt-2 max-w-2xl text-sm text-navy/70">
        Creators earn their share when you confirm a buyer’s payment under Orders. Pay what is owed to the creator’s Mobile Money number, then record the payout here with the transaction ID. Total owed to creators now: <strong>{gh(owed)}</strong>.
      </p>
      <ul className="mt-6 space-y-4">
        {rows.map((r) => (
          <li key={r.userId} className="rounded-2xl border border-navy/10 bg-white/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">{r.name} <span className="font-normal text-navy/70">· {r.email}</span>{r.suspended ? <span className="ml-2 rounded-full bg-red-100 px-3 py-1 text-xs font-normal text-red-900">Suspended</span> : null}</p>
              {canManage ? <ActionForm className="inline" action={setCreatorSuspendedAction} hidden={{ creatorId: r.userId, suspend: r.suspended ? "0" : "1" }} fields={[]} submitLabel={r.suspended ? "Restore creator" : "Suspend creator"} tone={r.suspended ? "quiet" : "danger"} /> : null}
            </div>
            {canPay ? (
              <>
                <p className="mt-2 text-sm">
                  Earned {gh(r.earned)} · Paid {gh(r.paid)} · <strong>Owed {gh(r.balance)}</strong> · MoMo number: {r.payoutPhone ?? <em>not set yet</em>}
                </p>
                {r.balance > 0n ? (
                  <div className="mt-3 max-w-xl">
                    <ActionForm
                      action={recordPayoutAction}
                      hidden={{ creatorId: r.userId }}
                      submitLabel="Record payout"
                      fields={[
                        { name: "amount", label: "Amount paid (GH₵)", required: true, defaultValue: (Number(r.balance) / 100).toFixed(2) },
                        { name: "reference", label: "MoMo transaction ID", required: true },
                      ]}
                    />
                  </div>
                ) : null}
                {(payouts[r.userId] ?? []).length > 0 ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold underline decoration-gold underline-offset-4">Payout history</summary>
                    <ul className="mt-2 space-y-1 text-sm">
                      {(payouts[r.userId] ?? []).map((p) => <li key={p.id}>{p.createdAt.toLocaleDateString("en-GB")} · {gh(p.amountMinor)} · {p.reference}</li>)}
                    </ul>
                  </details>
                ) : null}
              </>
            ) : null}
          </li>
        ))}
        {rows.length === 0 ? <li className="text-navy/70">No creators yet.</li> : null}
      </ul>
    </>
  );
}
