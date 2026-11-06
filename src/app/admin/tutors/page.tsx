import Link from "next/link";
import { ActionForm } from "@/components/forms/ActionForm";
import { requirePermission } from "@/server/context";
import { db } from "@/server/db";
import { can } from "@/server/permissions/authorize";
import { listTutorProfiles, TUTOR_STATUSES, tutorStatusCounts, type TutorStatus } from "@/server/tutors/service";
import { createTutorAction } from "../actions";

export const metadata = { title: "Tutors" };

const LABEL: Record<TutorStatus, string> = { PENDING: "Awaiting review", CHANGES_REQUESTED: "Changes requested", APPROVED: "Approved", REJECTED: "Rejected" };

export default async function AdminTutors({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const s = await requirePermission("tutors.review_applications", "/admin/tutors");
  const sp = await searchParams;
  const status = TUTOR_STATUSES.find((x) => x === sp.status);
  const [rows, counts] = await Promise.all([listTutorProfiles(db(), s.actor, status), tutorStatusCounts(db(), s.actor)]);
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Tutors</h1>
      <p className="mt-2 max-w-2xl text-sm text-navy/70">
        Review applications, edit what the public sees, and publish or hide profiles. Names, emails, phone numbers, qualifications and notes are private; only the public profile appears on the website.
      </p>
      <nav aria-label="Filter by status" className="mt-6 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/tutors" className={`rounded-full px-4 py-1.5 ${!status ? "bg-navy text-cream" : "border border-navy/25"}`}>All</Link>
        {TUTOR_STATUSES.map((st) => (
          <Link key={st} href={`/admin/tutors?status=${st}`} className={`rounded-full px-4 py-1.5 ${status === st ? "bg-navy text-cream" : "border border-navy/25"}`}>
            {LABEL[st]} ({counts[st]})
          </Link>
        ))}
      </nav>

      <ul className="mt-6 divide-y divide-navy/10 rounded-2xl border border-navy/10 bg-white/70">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <Link href={`/admin/tutors/${r.id}`} className="font-semibold underline decoration-gold underline-offset-4">{r.fullName}</Link>
              <p className="text-sm text-navy/70">
                {r.email} · {r.subjects.slice(0, 4).join(", ") || "no subjects yet"} · applied {r.createdAt.toLocaleDateString("en-GB")}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-full bg-navy/10 px-3 py-1">{LABEL[r.status]}</span>
              {r.status === "APPROVED" ? (
                <span className={`rounded-full px-3 py-1 ${r.isPublished ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>{r.isPublished ? "On website" : "Hidden"}</span>
              ) : null}
            </div>
          </li>
        ))}
        {rows.length === 0 ? <li className="p-4 text-navy/70">Nothing here yet.</li> : null}
      </ul>

      {can(s.actor, "tutors.approve") ? (
        <section className="mt-10 rounded-2xl border border-navy/10 bg-white/70 p-6">
          <h2 className="text-xl font-semibold">Add a tutor yourself</h2>
          <p className="mt-1 text-sm text-navy/70">For tutors recruited outside the website. They start as awaiting review; complete the profile, then approve.</p>
          <div className="mt-4 max-w-xl">
            <ActionForm
              action={createTutorAction}
              submitLabel="Add tutor"
              fields={[
                { name: "fullName", label: "Full name", required: true },
                { name: "email", label: "Email", type: "email", required: true },
                { name: "phone", label: "Phone (optional)", type: "tel" },
              ]}
            />
          </div>
        </section>
      ) : null}
    </>
  );
}
