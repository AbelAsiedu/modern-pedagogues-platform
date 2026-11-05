import Link from "next/link";
import { dashboardCounts } from "@/server/admin/users";
import { getBannerCount } from "@/server/content/banners";
import { getSession } from "@/server/context";
import { can } from "@/server/permissions/authorize";
import { db } from "@/server/db";

export default async function AdminHome() {
  // The layout already requires sign-in. Content-only staff (no users.view) get a dashboard of what they can do.
  const s = await getSession();
  const counts = s && can(s.actor, "users.view") ? await dashboardCounts(db(), s.actor) : null;
  const banners = await getBannerCount(db());
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      {counts ? (
        <dl className="mt-8 grid gap-4 sm:grid-cols-4">
          {[
            ["Users", counts.total],
            ["Active", counts.active],
            ["Awaiting email confirmation", counts.pending],
            ["Suspended", counts.suspended],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-2xl border border-navy/10 bg-white/70 p-5">
              <dt className="text-sm text-navy/70">{k}</dt>
              <dd className="mt-1 text-3xl font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <h2 className="mt-12 text-xl font-semibold">Manage</h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {s && can(s.actor, "users.view") ? (
          <li className="rounded-2xl border border-navy/10 bg-white/70 p-5">
            <Link href="/admin/users" className="font-semibold underline decoration-gold underline-offset-4">Users and roles</Link>
            <p className="mt-1 text-sm">Search accounts, suspend or restore, and assign roles.</p>
          </li>
        ) : null}
        <li className="rounded-2xl border border-navy/10 bg-white/70 p-5">
          <Link href="/admin/banners" className="font-semibold underline decoration-gold underline-offset-4">Home banners</Link>
          <p className="mt-1 text-sm">{banners.active} of {banners.total} slides are showing on the home page.</p>
        </li>
      </ul>
      <p className="mt-10 rounded-lg bg-cream-deep p-4 text-sm">
        Tutor applications, marketplace moderation, orders and payments will appear here as those features are built.
      </p>
    </>
  );
}
