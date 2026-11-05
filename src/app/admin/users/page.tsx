import { ActionForm } from "@/components/forms/ActionForm";
import { listUsers } from "@/server/admin/users";
import { requirePermission } from "@/server/context";
import { db } from "@/server/db";
import { can, canChangeRole } from "@/server/permissions/authorize";
import { ROLE_KEYS, ROLE_LABELS } from "@/server/permissions/catalog";
import { assignRoleAction, restoreUserAction, revokeRoleAction, suspendUserAction } from "../actions";

export const metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const s = await requirePermission("users.view", "/admin/users");
  const users = await listUsers(db(), s.actor, { search: q });
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Users</h1>
      <form className="mt-6 flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Search name or email" className="w-full max-w-sm rounded-lg border border-navy/25 bg-white px-3 py-2" aria-label="Search users" />
        <button className="rounded-full bg-navy px-5 py-2 text-sm font-semibold text-cream">Search</button>
      </form>
      <ul className="mt-8 space-y-4">
        {users.map((u) => {
          const addable = ROLE_KEYS.filter((r) => !u.roles.includes(r) && canChangeRole(s.actor, u.id, r));
          return (
            <li key={u.id} className="rounded-2xl border border-navy/10 bg-white/70 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{u.fullName} <span className="font-normal text-navy/70">· {u.email}</span></p>
                <p className="text-sm">
                  <span className={`rounded-full px-3 py-1 ${u.status === "ACTIVE" ? "bg-green-100 text-green-900" : u.status === "SUSPENDED" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}>
                    {u.status === "PENDING_VERIFICATION" ? "Awaiting email confirmation" : u.status === "ACTIVE" ? "Active" : "Suspended"}
                  </span>
                </p>
              </div>
              <p className="mt-1 text-xs text-navy/60">Joined {u.createdAt.toISOString().slice(0, 10)} · Last sign-in {u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 10) : "never"}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {u.roles.length === 0 ? <span className="text-sm text-navy/60">No roles</span> : null}
                {u.roles.map((r) => (
                  <span key={r} className="inline-flex items-center gap-1 rounded-full bg-cream-deep px-3 py-1 text-sm">
                    {ROLE_LABELS[r].name}
                    {canChangeRole(s.actor, u.id, r) ? (
                      <ActionForm className="inline" action={revokeRoleAction} hidden={{ userId: u.id, role: r }} fields={[]} submitLabel="Remove" tone="quiet" />
                    ) : null}
                  </span>
                ))}
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {addable.length > 0 ? (
                  <ActionForm
                    className="flex flex-wrap items-end gap-3"
                    action={assignRoleAction}
                    hidden={{ userId: u.id }}
                    submitLabel="Add role"
                    tone="quiet"
                    fields={[{ name: "role", label: "Add role", type: "select", options: addable.map((r) => ({ value: r, label: ROLE_LABELS[r].name })) }]}
                  />
                ) : null}
                {u.status === "SUSPENDED" && can(s.actor, "users.restore") ? (
                  <ActionForm className="flex items-end gap-3" action={restoreUserAction} hidden={{ userId: u.id }} fields={[]} submitLabel="Restore account" />
                ) : null}
                {u.status !== "SUSPENDED" && u.id !== s.user.id && can(s.actor, "users.suspend") ? (
                  <ActionForm
                    className="flex flex-wrap items-end gap-3"
                    action={suspendUserAction}
                    hidden={{ userId: u.id }}
                    submitLabel="Suspend"
                    tone="danger"
                    fields={[{ name: "reason", label: "Reason for suspending", required: true }]}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
        {users.length === 0 ? <li className="text-navy/70">No users found.</li> : null}
      </ul>
    </>
  );
}
