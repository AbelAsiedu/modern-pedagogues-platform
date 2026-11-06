import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/forms/ActionForm";
import { requireSession } from "@/server/context";
import { can } from "@/server/permissions/authorize";
import { ROLE_LABELS } from "@/server/permissions/catalog";
import { changePasswordAction, logoutAction } from "../auth-actions";

export const metadata: Metadata = { title: "My account", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const s = await requireSession("/account");
  const isStaff = can(s.actor, "users.view") || can(s.actor, "content.manage_site");
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Hello, {s.user.fullName}</h1>
      <p className="mt-2 text-navy/80">{s.user.email}</p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {s.actor.roles.map((r) => (
          <li key={r} className="rounded-full bg-cream-deep px-3 py-1 text-sm">{ROLE_LABELS[r].name}</li>
        ))}
      </ul>
      {isStaff ? (
        <p className="mt-6">
          <Link href="/admin" className="font-semibold underline decoration-gold underline-offset-4">Open the admin area</Link>
        </p>
      ) : (
        <p className="mt-6 rounded-lg bg-cream-deep p-4 text-sm">Your learning dashboard, bookings and reports are coming soon. For now, contact TMP to arrange tutoring.</p>
      )}

      <p className="mt-6">
        <Link href="/account/orders" className="font-semibold underline decoration-gold underline-offset-4">My orders and downloads</Link>
      </p>
      <p className="mt-3">
        {can(s.actor, "portal.creator") ? (
          <Link href="/creator" className="font-semibold underline decoration-gold underline-offset-4">My creator dashboard</Link>
        ) : (
          <Link href="/creator/join" className="font-semibold underline decoration-gold underline-offset-4">Sell or share your own resources</Link>
        )}
      </p>

      <h2 className="mt-12 text-xl font-semibold">Change password</h2>
      <div className="mt-4 rounded-2xl border border-navy/10 bg-white/70 p-6">
        <ActionForm
          action={changePasswordAction}
          submitLabel="Change password"
          fields={[
            { name: "currentPassword", label: "Current password", type: "password", autoComplete: "current-password", required: true },
            { name: "newPassword", label: "New password", type: "password", autoComplete: "new-password", required: true, hint: "At least 12 characters." },
          ]}
        />
      </div>

      <form action={logoutAction} className="mt-10">
        <button className="rounded-full border border-navy/30 px-5 py-2 text-sm font-semibold hover:border-navy">Sign out</button>
      </form>
    </div>
  );
}
