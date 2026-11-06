import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/forms/ActionForm";
import { ImageUploader } from "@/components/forms/ImageUploader";
import { ProductFileUploader } from "@/components/forms/ProductFileUploader";
import { listingFields } from "@/lib/listing-form";
import { kb, STATUS_BADGE, STATUS_LABEL } from "@/lib/resource-status";
import { requireSession } from "@/server/context";
import { db } from "@/server/db";
import { mediaOptions } from "@/server/media/service";
import { getCreatorProfile, getMyListing } from "@/server/resources/creators";
import { DECLARATIONS } from "@/server/resources/quality";
import { resourceTaxonomy } from "@/server/resources/taxonomy";
import { toDecimal } from "@/server/shop/service";
import { deleteListingAction, listingVisibilityAction, submitListingAction, updateListingAction } from "../actions";

export const metadata: Metadata = { title: "Edit resource", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EditListing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession(`/creator/${id}`);
  const profile = await getCreatorProfile(db(), s.user.id);
  if (!profile) redirect("/creator/join");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const item = await getMyListing(db(), s.actor, id).catch(() => null);
  if (!item) notFound();
  const { product: p, liveFile, pendingFile, reviews, unmet } = item;
  const [tax, pictures] = await Promise.all([resourceTaxonomy(db()), mediaOptions(db(), s.actor)]);
  const editable = p.status === "DRAFT" || p.status === "CHANGES_REQUESTED" || p.status === "APPROVED";
  const submittable = p.status === "DRAFT" || p.status === "CHANGES_REQUESTED";
  const file = pendingFile ?? liveFile;
  const lastFeedback = reviews.find((r) => r.decision !== "RESTORED");
  const unmetBeforeDeclaring = unmet.filter((u) => !u.startsWith("Tick the declarations"));

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <Link href="/creator" className="text-sm underline">← Creator dashboard</Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {p.title} <span className={`ml-2 align-middle rounded-full px-3 py-1 text-xs font-normal ${STATUS_BADGE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
      </h1>

      {p.status === "APPROVED" && p.isPublished ? (
        <p className="mt-3 text-sm">It is live: <Link href={`/resources/${p.slug}`} className="font-semibold underline decoration-gold underline-offset-4">view the public page</Link>.</p>
      ) : null}
      {p.status === "IN_REVIEW" ? <p className="mt-3 rounded-lg bg-amber-100 p-4 text-amber-900">A reviewer is reading this. You cannot change it until the decision, and you will be emailed.</p> : null}
      {p.status === "SUSPENDED" ? <p role="alert" className="mt-3 rounded-lg bg-red-100 p-4 text-red-900">TMP has taken this resource down. The reason is in the history below. Please contact TMP if you want to discuss it.</p> : null}
      {p.status === "REJECTED" ? <p role="alert" className="mt-3 rounded-lg bg-red-100 p-4 text-red-900">This resource was declined. The reasons are in the history below. You are welcome to create a new, improved resource.</p> : null}
      {p.status === "CHANGES_REQUESTED" && lastFeedback ? (
        <section className="mt-4 rounded-2xl border border-orange-300 bg-orange-50 p-5">
          <h2 className="font-semibold">What the reviewer asks you to change</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-6">{lastFeedback.note}</p>
        </section>
      ) : null}

      {submittable ? (
        <section aria-labelledby="ready-h" className="mt-8 rounded-2xl border border-navy/10 bg-white/70 p-6">
          <h2 id="ready-h" className="text-xl font-semibold">Ready to submit?</h2>
          {unmetBeforeDeclaring.length > 0 ? (
            <>
              <p className="mt-2 text-sm text-navy/80">Still missing:</p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">{unmetBeforeDeclaring.map((u) => <li key={u}>{u}</li>)}</ul>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-green-800">Everything required is in place. Confirm the declarations to send it for review.</p>
              <div className="mt-4 max-w-2xl">
                <ActionForm
                  action={submitListingAction}
                  hidden={{ listingId: p.id }}
                  submitLabel="Submit for review"
                  fields={[{ name: "declarations", label: "I confirm all of the following:", type: "checkbox" }]}
                />
                <ol className="mt-3 list-decimal space-y-1 pl-6 text-sm text-navy/80">{DECLARATIONS.map((d) => <li key={d}>{d}</li>)}</ol>
              </div>
            </>
          )}
        </section>
      ) : null}

      {editable ? (
        <>
          <section className="mt-8 grid gap-8 rounded-2xl border border-navy/10 bg-white/70 p-6 lg:grid-cols-2">
            <div>
              <h2 className="text-lg font-semibold">The PDF</h2>
              <p className="mt-1 text-sm text-navy/80">
                {file ? `${file.filename} · ${kb(file.byteSize)} · ${file.pages ?? "?"} pages${pendingFile && liveFile ? " (a new version waiting for review)" : ""}` : "No PDF yet."}
              </p>
              <div className="mt-4"><ProductFileUploader productId={p.id} hasFile={Boolean(file)} /></div>
              {p.status === "APPROVED" ? <p className="mt-3 text-xs text-navy/70">Uploading a new PDF for an approved resource takes it off the website until the new version is approved.</p> : null}
            </div>
            <div>
              <h2 className="text-lg font-semibold">Cover picture</h2>
              <p className="mt-1 text-sm text-navy/80">Upload it here, then choose it in the form below.</p>
              <div className="mt-4"><ImageUploader label="Upload a cover picture" /></div>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-navy/10 bg-white/70 p-6">
            <h2 className="text-lg font-semibold">Details</h2>
            <div className="mt-4">
              <ActionForm
                action={updateListingAction}
                hidden={{ listingId: p.id }}
                submitLabel="Save changes"
                fields={listingFields({ ...tax, pictures, p, priceText: toDecimal })}
              />
            </div>
          </section>
        </>
      ) : null}

      {p.status === "APPROVED" ? (
        <section className="mt-6 rounded-2xl border border-navy/10 bg-white/70 p-6">
          <h2 className="text-lg font-semibold">Visibility</h2>
          <p className="mt-1 text-sm text-navy/80">{p.isPublished ? "Visitors can see it now." : "It is hidden. Buyers who already paid can still download it."}</p>
          <div className="mt-3">
            <ActionForm action={listingVisibilityAction} hidden={{ listingId: p.id, show: p.isPublished ? "0" : "1" }} fields={[]} submitLabel={p.isPublished ? "Hide from the Resources page" : "Show on the Resources page"} tone="quiet" />
          </div>
        </section>
      ) : null}

      {reviews.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Review history</h2>
          <ul className="mt-3 space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-2xl border border-navy/10 bg-white/70 p-4 text-sm">
                <p className="font-semibold">{r.decision.replace("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())} <span className="font-normal text-navy/70">· {r.createdAt.toLocaleDateString("en-GB")}</span></p>
                {r.note ? <p className="mt-1 whitespace-pre-line leading-6">{r.note}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {p.status !== "IN_REVIEW" ? (
        <div className="mt-10">
          <ActionForm action={deleteListingAction} hidden={{ listingId: p.id }} fields={[]} submitLabel="Delete this resource" tone="danger" />
        </div>
      ) : null}
    </div>
  );
}
