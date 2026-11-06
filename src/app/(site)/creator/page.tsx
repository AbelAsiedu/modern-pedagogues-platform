import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/forms/ActionForm";
import { STATUS_BADGE, STATUS_LABEL } from "@/lib/resource-status";
import { requireSession } from "@/server/context";
import { db } from "@/server/db";
import { creatorEarnings, getCreatorProfile, listMyListings, moneyText } from "@/server/resources/creators";
import { KIND_LABELS } from "@/server/resources/quality";
import { priceText } from "@/server/shop/service";
import { updateProfileAction } from "./actions";

export const metadata: Metadata = { title: "Creator dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CreatorDashboard() {
  const s = await requireSession("/creator");
  const profile = await getCreatorProfile(db(), s.user.id);
  if (!profile) redirect("/creator/join");
  const [listings, e] = await Promise.all([listMyListings(db(), s.actor).catch(() => null), creatorEarnings(db(), s.actor).catch(() => null)]);
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <Link href="/account" className="text-sm underline">← My account</Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Creator dashboard</h1>
      <p className="mt-2 text-navy/80">Selling as <strong>{profile.displayName}</strong>.</p>
      {profile.isSuspended ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-100 p-4 text-red-900">Your creator account is suspended, so you cannot upload or submit resources. Please contact TMP.</p>
      ) : null}

      {e ? (
        <dl className="mt-8 grid gap-4 sm:grid-cols-4">
          {[
            ["Paid sales", String(e.sales)],
            ["Earned (your 70%)", moneyText(e.earned)],
            ["Paid to you", moneyText(e.paidOut)],
            ["Owed to you", moneyText(e.balance)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-navy/10 bg-white/70 p-4">
              <dt className="text-sm text-navy/70">{k}</dt>
              <dd className="mt-1 text-2xl font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {!profile.payoutPhone ? <p className="mt-4 rounded-lg bg-amber-100 p-3 text-sm text-amber-900">Add your Mobile Money number below so we can pay you.</p> : null}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Your resources</h2>
        <div className="flex gap-3">
          <Link href="/resources/standards" className="rounded-full border-2 border-royal px-5 py-2 text-sm font-semibold text-royal hover:bg-royal hover:text-cream">Quality standard</Link>
          {!profile.isSuspended ? <Link href="/creator/new" className="rounded-full bg-royal px-5 py-2 text-sm font-semibold text-cream hover:bg-royal-deep">New resource</Link> : null}
        </div>
      </div>
      <ul className="mt-4 space-y-3">
        {(listings ?? []).map((l) => (
          <li key={l.id} className="rounded-2xl border border-navy/10 bg-white/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">
                <Link href={`/creator/${l.id}`} className="hover:text-royal">{l.title}</Link>
                <span className={`ml-2 rounded-full px-3 py-1 text-xs font-normal ${STATUS_BADGE[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                {l.status === "APPROVED" && !l.isPublished ? <span className="ml-2 rounded-full bg-navy/10 px-3 py-1 text-xs font-normal">Hidden</span> : null}
              </p>
              <Link href={`/creator/${l.id}`} className="text-sm font-semibold underline decoration-gold underline-offset-4">Open</Link>
            </div>
            <p className="mt-2 text-sm text-navy/80">
              {KIND_LABELS[l.kind]} · {priceText(l)} · {l.priceMinor === 0n ? `${l.downloadCount} downloads` : `${l.sales} paid sales`}
            </p>
          </li>
        ))}
        {listings && listings.length === 0 ? <li className="text-navy/70">You have not added a resource yet. Start with “New resource”.</li> : null}
      </ul>

      <h2 className="mt-12 text-xl font-semibold">Your profile</h2>
      <div className="mt-4 max-w-xl rounded-2xl border border-navy/10 bg-white/70 p-6">
        <ActionForm
          action={updateProfileAction}
          submitLabel="Save profile"
          fields={[
            { name: "displayName", label: "Name to show on your resources", required: true, defaultValue: profile.displayName },
            { name: "bio", label: "About you", type: "textarea", rows: 3, defaultValue: profile.bio },
            { name: "payoutPhone", label: "Mobile Money number for payouts", type: "tel", defaultValue: profile.payoutPhone ?? "", hint: "Only TMP finance staff see this." },
          ]}
        />
      </div>
    </div>
  );
}
