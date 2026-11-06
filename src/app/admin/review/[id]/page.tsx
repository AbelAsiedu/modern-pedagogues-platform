import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import { kb, STATUS_BADGE, STATUS_LABEL } from "@/lib/resource-status";
import { requirePermission } from "@/server/context";
import { db } from "@/server/db";
import { applicableCriteria, AVERAGE_PASS, CRITERION_PASS, KIND_LABELS, SCORE_LABELS } from "@/server/resources/quality";
import { getReviewItem } from "@/server/resources/review";
import { priceText } from "@/server/shop/service";
import { decideResourceAction, restoreResourceAction, suspendResourceAction } from "../../actions";

export const metadata = { title: "Review a resource" };

const scoreOptions = [{ value: "", label: "Not scored" }, ...SCORE_LABELS.map((l, i) => ({ value: String(i), label: `${i} · ${l}` }))];

export default async function ReviewItem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requirePermission("marketplace.moderate", `/admin/review/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const item = await getReviewItem(db(), s.actor, id).catch(() => null);
  if (!item) notFound();
  const { product: p, owner, file, reviews, unmet } = item;
  const own = p.ownerId === s.actor.id;
  const criteria = applicableCriteria(p.priceMinor > 0n);
  const fields: FieldSpec[] = [
    { name: "decision", label: "Decision", type: "select", required: true, options: [
      { value: "APPROVED", label: "Approve (publishes it)" },
      { value: "CHANGES_REQUESTED", label: "Ask for changes" },
      { value: "REJECTED", label: "Decline" },
    ], defaultValue: "CHANGES_REQUESTED" },
    ...criteria.map((c): FieldSpec => ({ name: `score_${c.key}`, label: `${c.label}${c.gate ? " (gate)" : ""}`, type: "select", options: scoreOptions, defaultValue: "", hint: c.question })),
    { name: "note", label: "Feedback for the creator", type: "textarea", rows: 6, hint: "Required when asking for changes or declining (at least 20 characters). Be specific: say what to fix and where. Optional when approving." },
  ];
  return (
    <>
      <Link href="/admin/review" className="text-sm underline">← Review queue</Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {p.title} <span className={`ml-2 align-middle rounded-full px-3 py-1 text-xs font-normal ${STATUS_BADGE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
      </h1>
      <p className="mt-2 text-sm text-navy/80">
        {KIND_LABELS[p.kind]} · {p.subject || "no subject"} · {priceText(p)} · by {owner?.name ?? "unknown"}{owner ? ` (${owner.email})` : ""}{owner?.suspended ? " · creator suspended" : ""}
      </p>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-navy/10 bg-white/70 p-5">
          <h2 className="text-lg font-semibold">The file</h2>
          {file ? (
            <>
              <p className="mt-2 text-sm">{file.filename} · {kb(file.byteSize)} · {file.pages ?? "?"} pages</p>
              <p className="mt-3"><a href={`/api/admin/review-files/${p.id}`} className="rounded-full bg-navy px-5 py-2 text-sm font-semibold text-cream hover:bg-navy/90">Download the PDF to read it</a></p>
              {file.notes.length > 0 ? (
                <>
                  <p className="mt-4 text-sm font-semibold">Automatic checks noted:</p>
                  <ul className="mt-1 list-disc space-y-1 pl-6 text-sm">{file.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                </>
              ) : <p className="mt-3 text-sm text-green-800">Automatic safety checks found nothing unusual.</p>}
            </>
          ) : <p className="mt-2 text-sm">No file uploaded.</p>}
          {unmet.length > 0 ? (
            <>
              <p className="mt-4 text-sm font-semibold text-amber-900">The listing is incomplete:</p>
              <ul className="mt-1 list-disc space-y-1 pl-6 text-sm">{unmet.map((u) => <li key={u}>{u}</li>)}</ul>
            </>
          ) : null}
        </div>
        <div className="rounded-2xl border border-navy/10 bg-white/70 p-5 text-sm leading-6">
          <h2 className="text-lg font-semibold">What the creator wrote</h2>
          <p className="mt-2"><strong>Summary:</strong> {p.summary}</p>
          <p className="mt-2 whitespace-pre-line"><strong>Description:</strong> {p.description}</p>
          <p className="mt-2"><strong>Who it is for:</strong> {p.audience}</p>
          <p className="mt-2"><strong>Levels:</strong> {p.levelKeys.join(", ") || "none"} · <strong>Curricula:</strong> {p.curriculumKeys.join(", ") || "none"} · <strong>Language:</strong> {p.language}</p>
          <p className="mt-2"><strong>Outcomes:</strong></p>
          <ul className="list-disc pl-6">{p.outcomes.map((o) => <li key={o}>{o}</li>)}</ul>
          {p.tableOfContents ? <p className="mt-2 whitespace-pre-line"><strong>Contents:</strong> {p.tableOfContents}</p> : null}
          {p.coverPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.coverPath} alt="Cover" className="mt-3 h-32 rounded-lg object-cover" />
          ) : null}
        </div>
      </section>

      {p.status === "IN_REVIEW" ? (
        own ? (
          <p className="mt-8 rounded-lg bg-amber-100 p-4 text-amber-900">This is your own resource, so another reviewer must decide it.</p>
        ) : (
          <section className="mt-8 rounded-2xl border border-navy/10 bg-white/70 p-6">
            <h2 className="text-xl font-semibold">Your decision</h2>
            <p className="mt-1 text-sm text-navy/70">
              To approve, every criterion must score at least {CRITERION_PASS} ({SCORE_LABELS[CRITERION_PASS]}) and the average at least {AVERAGE_PASS}. The three gates cannot be traded against the others.
            </p>
            <div className="mt-4 max-w-2xl">
              <ActionForm action={decideResourceAction} hidden={{ productId: p.id, submission: String(p.submissionCount) }} fields={fields} submitLabel="Record decision" />
            </div>
          </section>
        )
      ) : null}

      {p.status === "APPROVED" && !own ? (
        <section className="mt-8 rounded-2xl border border-red-200 bg-white/70 p-6">
          <h2 className="text-xl font-semibold">Take down</h2>
          <p className="mt-1 text-sm text-navy/70">For a rights complaint or a safety problem. It disappears from the website at once, earlier buyers cannot download it either, and the creator is emailed your reason.</p>
          <div className="mt-4 max-w-xl">
            <ActionForm action={suspendResourceAction} hidden={{ productId: p.id }} fields={[{ name: "reason", label: "Reason (sent to the creator)", type: "textarea", rows: 4, required: true }]} submitLabel="Take it down" tone="danger" />
          </div>
        </section>
      ) : null}
      {p.status === "SUSPENDED" ? (
        <section className="mt-8 rounded-2xl border border-navy/10 bg-white/70 p-6">
          <h2 className="text-xl font-semibold">Restore</h2>
          <div className="mt-4"><ActionForm action={restoreResourceAction} hidden={{ productId: p.id }} fields={[]} submitLabel="Put it back on the website" /></div>
        </section>
      ) : null}

      {reviews.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">History</h2>
          <ul className="mt-3 space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-2xl border border-navy/10 bg-white/70 p-4 text-sm">
                <p className="font-semibold">{r.decision.replace("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())} <span className="font-normal text-navy/70">· submission {r.submission} · {r.createdAt.toLocaleString("en-GB")}</span></p>
                {r.scores ? <p className="mt-1 text-navy/80">Scores: {Object.entries(r.scores as Record<string, number>).map(([k, v]) => `${k} ${v}`).join(", ")}</p> : null}
                {r.note ? <p className="mt-1 whitespace-pre-line leading-6">{r.note}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
