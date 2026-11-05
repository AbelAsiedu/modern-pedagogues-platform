import { listAuditLogs } from "@/server/admin/audit";
import { requirePermission } from "@/server/context";
import { db } from "@/server/db";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  const s = await requirePermission("audit.view", "/admin/audit");
  const rows = await listAuditLogs(db(), s.actor, 200);
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Audit log</h1>
      <p className="mt-2 text-sm text-navy/70">Newest first. Entries cannot be edited or deleted.</p>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-navy/10 bg-white/70">
        <table className="w-full text-left text-sm">
          <thead className="bg-cream-deep">
            <tr><th className="p-3">When (UTC)</th><th className="p-3">Who</th><th className="p-3">Action</th><th className="p-3">Details</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-navy/10 align-top">
                <td className="whitespace-nowrap p-3">{r.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                <td className="p-3">{r.actorEmail ?? "system"}</td>
                <td className="p-3 font-mono text-xs">{r.action}</td>
                <td className="p-3 text-xs">{r.entityType}{r.metadata ? ` · ${JSON.stringify(r.metadata)}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
