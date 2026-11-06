import Link from "next/link";
import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import { NewResourceForm } from "@/components/forms/NewResourceForm";
import { ProductFileUploader } from "@/components/forms/ProductFileUploader";
import { listingFields } from "@/lib/listing-form";
import { kb, STATUS_BADGE, STATUS_LABEL } from "@/lib/resource-status";
import { requirePermission } from "@/server/context";
import { db } from "@/server/db";
import { mediaOptions } from "@/server/media/service";
import { resourceTaxonomy } from "@/server/resources/taxonomy";
import { listProducts, priceText, toDecimal } from "@/server/shop/service";
import { deleteProductAction, setProductPublishedAction, updateProductAction } from "../actions";

export const metadata = { title: "Resources" };

export default async function ResourcesAdmin() {
  const s = await requirePermission("commerce.manage_products", "/admin/shop");
  const [all, pictures, tax] = await Promise.all([listProducts(db(), s.actor), mediaOptions(db(), s.actor), resourceTaxonomy(db())]);
  const own = all.filter((p) => !p.ownerId);
  const creators = all.filter((p) => p.ownerId);
  const base = { ...tax, pictures, staff: true, priceText: toDecimal };
  const newFields: FieldSpec[] = [
    ...listingFields(base).filter((f) => f.name !== "isPublished"),
    { name: "file", label: "The PDF", type: "file", accept: "application/pdf,.pdf", hint: "PDF only, up to 15 MB. Free ones can be downloaded by any signed-in visitor; paid ones stay locked until you confirm the buyer's payment." },
    { name: "publishNow", label: "Publish now (show it on the Resources page)", type: "checkbox", defaultValue: true },
  ];
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Resources</h1>
      <p className="mt-2 max-w-2xl text-sm text-navy/70">
        Free and paid resources that TMP publishes itself. They need no review. Add one with its PDF and tick Publish now, and it appears on the Resources page straight away. Paid ones stay locked until you confirm the buyer’s payment under Orders; free ones download straight away for signed-in visitors. Resources from other creators are reviewed under Review.
      </p>

      <section className="mt-8 rounded-2xl border border-navy/10 bg-white/70 p-6">
        <h2 className="text-xl font-semibold">Add a resource</h2>
        <div className="mt-4 max-w-2xl"><NewResourceForm fields={newFields} /></div>
      </section>

      <ul className="mt-8 space-y-4">
        {own.map((p) => (
          <li key={p.id} className="rounded-2xl border border-navy/10 bg-white/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">
                {p.title} <span className="font-normal text-navy/70">· {priceText(p)}</span>
                <span className={`ml-2 rounded-full px-3 py-1 text-xs font-normal ${p.isPublished ? "bg-green-100 text-green-900" : "bg-navy/10"}`}>{p.isPublished ? "Live" : "Hidden"}</span>
                <span className={`ml-2 rounded-full px-3 py-1 text-xs font-normal ${p.fileId ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>{p.fileId ? `PDF: ${p.fileName} (${kb(p.fileSize ?? 0)})` : "No PDF yet"}</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {p.isPublished ? (
                  <>
                    <Link href={`/resources/${p.slug}`} className="text-sm font-semibold text-royal underline decoration-gold decoration-2 underline-offset-4">View on site</Link>
                    <ActionForm className="inline" action={setProductPublishedAction} hidden={{ productId: p.id, show: "0" }} fields={[]} submitLabel="Hide" tone="quiet" />
                  </>
                ) : p.fileId ? (
                  <ActionForm className="inline" action={setProductPublishedAction} hidden={{ productId: p.id, show: "1" }} fields={[]} submitLabel="Show on Resources page" />
                ) : null}
                <ActionForm className="inline" action={deleteProductAction} hidden={{ productId: p.id }} fields={[]} submitLabel="Delete" tone="danger" />
              </div>
            </div>
            {!p.isPublished ? (
              <p className="mt-2 text-sm text-amber-900">
                {p.fileId ? "Hidden: visitors cannot see it yet. Press “Show on Resources page”." : "Hidden: it has no PDF yet. Open Edit, upload the PDF, then show it."}
              </p>
            ) : null}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold underline decoration-gold underline-offset-4">Edit</summary>
              <div className="mt-4 grid max-w-5xl gap-8 lg:grid-cols-2">
                <div><ActionForm action={updateProductAction} hidden={{ productId: p.id }} fields={listingFields({ ...base, p })} submitLabel="Save changes" /></div>
                <div><ProductFileUploader productId={p.id} hasFile={!!p.fileId} /></div>
              </div>
            </details>
          </li>
        ))}
        {own.length === 0 ? <li className="text-navy/70">No TMP resources yet.</li> : null}
      </ul>

      <h2 className="mt-12 text-xl font-semibold">From creators</h2>
      <p className="mt-1 text-sm text-navy/70">Read-only here. Review, take down or restore them under <Link href="/admin/review" className="underline decoration-gold underline-offset-4">Review</Link>.</p>
      <ul className="mt-4 space-y-2">
        {creators.map((p) => (
          <li key={p.id} className="rounded-xl border border-navy/10 bg-white/60 px-4 py-3 text-sm">
            <Link href={`/admin/review/${p.id}`} className="font-semibold hover:text-royal">{p.title}</Link> · {p.ownerName} · {priceText(p)}
            <span className={`ml-2 rounded-full px-3 py-1 text-xs ${STATUS_BADGE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
          </li>
        ))}
        {creators.length === 0 ? <li className="text-navy/70">None yet.</li> : null}
      </ul>
    </>
  );
}
