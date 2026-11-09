import Link from "next/link";
import { Icon, type IconName } from "@/components/admin/AdminNav";
import { headers } from "next/headers";
import { checkSiteAddress } from "@/lib/site-address";
import { twoStepNotice } from "@/lib/two-step-check";
import { env } from "@/server/env";
import { adminOverview } from "@/server/admin/overview";
import { getSession } from "@/server/context";
import { db } from "@/server/db";
import { isMediaStaff } from "@/server/media/service";
import { can } from "@/server/permissions/authorize";

const greeting = () => {
  const h = new Date().getUTCHours(); // Ghana is on UTC all year
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

const ACTION_LABELS: Record<string, string> = {
  "site_content.updated": "Edited site text",
  "banner.created": "Added a slide",
  "banner.updated": "Edited a slide",
  "banner.deleted": "Removed a slide",
  "media.uploaded": "Uploaded a picture",
  "media.replaced": "Replaced a picture",
  "media.deleted": "Deleted a picture",
  "order.placed": "Order placed",
  "order.paid": "Order marked paid",
};
const labelFor = (action: string) => ACTION_LABELS[action] ?? action.replace(/[._]/g, " ").replace(/^./, (c) => c.toUpperCase());

export default async function AdminHome() {
  const s = await getSession();
  const actor = s?.actor ?? null;
  const o = await adminOverview(db(), actor);
  const first = (s?.user.fullName ?? "").split(" ")[0];
  // Only people who can run the site settings need to see this.
  const address = can(actor, "content.manage_site") ? checkSiteAddress(env().APP_URL, (await headers()).get("host")) : ({ ok: true } as const);

  const twoStep = can(actor, "content.manage_site") ? twoStepNotice(Boolean(env().MFA_ENCRYPTION_KEY), env().STAFF_MFA_REQUIRED) : null;

  type Quick = { href: string; label: string; icon: IconName; show: boolean };
  const quick: Quick[] = ([
    { href: "/admin/banners", label: "Edit the home slideshow", icon: "slideshow", show: can(actor, "content.manage_site") },
    { href: "/admin/content", label: "Edit site text", icon: "text", show: can(actor, "content.manage_site") },
    { href: "/admin/tutors", label: "Manage tutor profiles", icon: "tutors", show: can(actor, "tutors.review_applications") },
    { href: "/admin/images", label: "Change site pictures", icon: "layout", show: can(actor, "content.manage_site") },
    { href: "/admin/media", label: "Upload or replace pictures", icon: "media", show: isMediaStaff(actor) },
    { href: "/admin/review", label: "Review resources", icon: "check", show: can(actor, "marketplace.moderate") },
    { href: "/admin/orders", label: "Confirm payments", icon: "receipt", show: can(actor, "commerce.manage_orders") },
  ] satisfies Quick[]).filter((q) => q.show);

  return (
    <>
      <header>
        <p className="text-sm font-medium text-navy/60">{greeting()}{first ? `, ${first}` : ""}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dashboard</h1>
      </header>

      {address.ok ? null : (
        <section role="alert" className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
          <h2 className="font-semibold">Email links point to the wrong address</h2>
          <p className="mt-1 text-sm">
            You are using this site at <strong>{address.actual}</strong>, but the setting that builds the links in emails (confirm your email, reset your password, order notices) says <strong>{address.configured}</strong>.
            Visitors who click those links land on a page that does not exist. Fix it by running this once, then ask anyone who is stuck to request a new email:
          </p>
          <p className="mt-2 overflow-x-auto rounded-lg bg-white px-3 py-2 font-mono text-xs">{address.command}</p>
          <p className="mt-2 text-xs">If you have a custom domain, use that address instead.</p>
        </section>
      )}

      {twoStep ? (
        <section role="alert" className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
          <h2 className="font-semibold">{twoStep.title}</h2>
          <p className="mt-1 text-sm">{twoStep.body}</p>
          {twoStep.command ? <p className="mt-2 overflow-x-auto whitespace-pre rounded-lg bg-white px-3 py-2 font-mono text-xs">{twoStep.command}</p> : null}
        </section>
      ) : null}

      {o.attention.length > 0 ? (
        <section aria-labelledby="attention" className="mt-8">
          <h2 id="attention" className="text-sm font-semibold uppercase tracking-[0.14em] text-navy/55">Needs your attention</h2>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {o.attention.map((t) => (
              <li key={t.key}>
                <Link href={t.href} className="admin-tile group block h-full rounded-2xl bg-white p-5">
                  <span className="flex items-start justify-between">
                    <span className="text-4xl font-semibold tabular-nums">{t.value}</span>
                    <span className={`mt-1 h-2.5 w-2.5 rounded-full ${t.tone === "alert" ? "bg-gold" : "bg-emerald-500"}`} aria-hidden="true" />
                  </span>
                  <span className="mt-2 block text-sm font-medium">{t.label}</span>
                  <span className="mt-1 block text-xs text-navy/55 group-hover:text-navy">{t.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {o.numbers.length > 0 ? (
        <section aria-labelledby="numbers" className="mt-10">
          <h2 id="numbers" className="text-sm font-semibold uppercase tracking-[0.14em] text-navy/55">At a glance</h2>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {o.numbers.map((t) => (
              <Link key={t.key} href={t.href} className="admin-tile block rounded-2xl bg-white p-5">
                <dd className="text-3xl font-semibold tabular-nums">{t.value}</dd>
                <dt className="mt-1 text-sm text-navy/65">{t.label}</dt>
              </Link>
            ))}
          </dl>
        </section>
      ) : null}

      <div className="mt-10 grid gap-8 lg:grid-cols-5">
        {quick.length > 0 ? (
          <section aria-labelledby="quick" className="lg:col-span-3">
            <h2 id="quick" className="text-sm font-semibold uppercase tracking-[0.14em] text-navy/55">Quick actions</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {quick.map((q) => (
                <li key={q.href}>
                  <Link href={q.href} className="admin-tile flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-sm font-medium">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-navy text-gold"><Icon name={q.icon} /></span>
                    {q.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {o.recent.length > 0 ? (
          <section aria-labelledby="recent" className="lg:col-span-2">
            <h2 id="recent" className="text-sm font-semibold uppercase tracking-[0.14em] text-navy/55">Recent activity</h2>
            <ol className="admin-tile mt-3 divide-y divide-navy/8 rounded-2xl bg-white">
              {o.recent.map((r) => (
                <li key={r.id} className="px-4 py-3 text-sm">
                  <p className="font-medium">{labelFor(r.action)}</p>
                  <p className="text-xs text-navy/55">{r.actorName ?? "System"} · {r.at.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" })}</p>
                </li>
              ))}
            </ol>
            {can(actor, "audit.view") ? <Link href="/admin/audit" className="mt-3 inline-block text-sm font-semibold underline decoration-gold underline-offset-4">Full audit log</Link> : null}
          </section>
        ) : null}
      </div>
    </>
  );
}
