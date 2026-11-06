import Link from "next/link";
import { KIND_LABELS } from "@/server/resources/quality";
import { STATUS_BADGE, STATUS_LABEL, type ResourceStatusKey } from "@/lib/resource-status";
import { requirePermission } from "@/server/context";
import { db } from "@/server/db";
import { creatorResourceCounts, listCreatorResources, listReviewQueue } from "@/server/resources/review";
import { priceText } from "@/server/shop/service";

export const metadata = { title: "Resource review" };

const TABS: { key: ResourceStatusKey; label: string }[] = [
  { key: "IN_REVIEW", label: "Waiting for review" },
  { key: "CHANGES_REQUESTED", label: "Changes requested" },
  { key: "APPROVED", label: "Approved" },
  { key: "SUSPENDED", label: "Taken down" },
  { key: "REJECTED", label: "Declined" },
  { key: "DRAFT", label: "Drafts" },
];

export default async function ReviewQueue({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const s = await requirePermission("marketplace.moderate", "/admin/review");
  const sp = await searchParams;
  const status = TABS.find((t) => t.key === sp.status)?.key ?? "IN_REVIEW";
  const [counts, queue, rows] = await Promise.all([
    creatorResourceCounts(db(), s.actor),
    status === "IN_REVIEW" ? listReviewQueue(db(), s.actor) : Promise.resolve([]),
    status === "IN_REVIEW" ? Promise.resolve([]) : listCreatorResources(db(), s.actor, status),
  ]);
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Resource review</h1>
      <p className="mt-2 max-w-2xl text-sm text-navy/70">
        Resources submitted by creators. Read the PDF, score each criterion, then approve, ask for changes or decline. Our own resources are managed under Resources and need no review.
      </p>
      <nav aria-label="Status" className="mt-6 flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/review?status=${t.key}`} className={`rounded-full px-4 py-1.5 ${t.key === status ? "bg-navy text-cream" : "border border-navy/25 hover:border-navy"}`}>
            {t.label} ({counts[t.key] ?? 0})
          </Link>
        ))}
      </nav>
      <ul className="mt-6 space-y-3">
        {status === "IN_REVIEW"
          ? queue.map((q) => (
              <li key={q.id} className="rounded-2xl border border-navy/10 bg-white/70 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">{q.title} <span className="font-normal text-navy/70">· {KIND_LABELS[q.kind]} · {priceText(q)}</span></p>
                  <Link href={`/admin/review/${q.id}`} className="rounded-full bg-navy px-5 py-2 text-sm font-semibold text-cream hover:bg-navy/90">Review</Link>
                </div>
                <p className="mt-1 text-sm text-navy/80">By {q.creatorName ?? "unknown"} · submitted {q.submittedAt?.toLocaleDateString("en-GB")}{q.submissionCount > 1 ? ` · submission ${q.submissionCount}` : ""}</p>
              </li>
            ))
          : rows.map((r) => (
              <li key={r.id} className="rounded-2xl border border-navy/10 bg-white/70 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">
                    {r.title} <span className={`ml-2 rounded-full px-3 py-1 text-xs font-normal ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                    {r.status === "APPROVED" && !r.isPublished ? <span className="ml-2 rounded-full bg-navy/10 px-3 py-1 text-xs font-normal">Hidden by creator</span> : null}
                  </p>
                  <Link href={`/admin/review/${r.id}`} className="text-sm font-semibold underline decoration-gold underline-offset-4">Open</Link>
                </div>
                <p className="mt-1 text-sm text-navy/80">By {r.creatorName ?? "unknown"} · {KIND_LABELS[r.kind]} · {priceText(r)}</p>
              </li>
            ))}
        {(status === "IN_REVIEW" ? queue.length : rows.length) === 0 ? <li className="text-navy/70">Nothing here.</li> : null}
      </ul>
    </>
  );
}
