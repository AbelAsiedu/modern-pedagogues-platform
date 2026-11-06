import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import { ProductFileUploader } from "@/components/forms/ProductFileUploader";
import { format, money } from "@/lib/money";
import { requirePermission } from "@/server/context";
import { db } from "@/server/db";
import { mediaOptions } from "@/server/media/service";
import { listProducts, toDecimal } from "@/server/shop/service";
import { createProductAction, deleteProductAction, updateProductAction } from "../actions";

export const metadata = { title: "Shop" };

type Row = Awaited<ReturnType<typeof listProducts>>[number];

function fields(pictures: readonly { value: string; label: string }[], p?: Row): FieldSpec[] {
  const covers = [{ value: "", label: "No picture (show a PDF tile)" }, ...pictures];
  if (p?.coverPath && !covers.some((c) => c.value === p.coverPath)) covers.unshift({ value: p.coverPath, label: `${p.coverPath} (missing)` });
  return [
    { name: "title", label: "Title", required: true, defaultValue: p?.title ?? "" },
    { name: "summary", label: "Short summary", type: "textarea", rows: 2, required: true, defaultValue: p?.summary ?? "", hint: "One or two sentences shown on the shop page and used by Kaitlyn." },
    { name: "description", label: "Full description", type: "textarea", rows: 6, defaultValue: p?.description ?? "", hint: "What is inside, who it is for. Plain text." },
    { name: "price", label: "Price (GH₵)", required: true, defaultValue: p ? toDecimal(p.priceMinor) : "", hint: "For example 25 or 25.50. Between 1 and 5,000." },
    { name: "coverPath", label: "Cover picture", type: "select", options: covers, defaultValue: p?.coverPath ?? "", hint: "Upload pictures under Media first." },
    { name: "sortOrder", label: "Order (lowest first)", type: "number", defaultValue: p?.sortOrder ?? 0 },
    { name: "isPublished", label: "Published in the shop", type: "checkbox", defaultValue: p?.isPublished ?? false, hint: p ? (p.fileId ? undefined : "Upload the PDF before publishing.") : "You can publish after uploading the PDF." },
  ];
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function ShopAdmin() {
  const s = await requirePermission("commerce.manage_products", "/admin/shop");
  const [items, pictures] = await Promise.all([listProducts(db(), s.actor), mediaOptions(db(), s.actor)]);
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Shop</h1>
      <p className="mt-2 max-w-2xl text-sm text-navy/70">
        Digital resources sold on the Shop page. Add a product, upload its PDF, then tick Published. Buyers get the PDF only after you confirm their payment under Orders.
      </p>

      <section className="mt-8 rounded-2xl border border-navy/10 bg-white/70 p-6">
        <h2 className="text-xl font-semibold">Add a product</h2>
        <div className="mt-4 max-w-2xl"><ActionForm action={createProductAction} fields={fields(pictures).filter((f) => f.name !== "isPublished")} submitLabel="Add product" /></div>
      </section>

      <ul className="mt-8 space-y-4">
        {items.map((p) => (
          <li key={p.id} className="rounded-2xl border border-navy/10 bg-white/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">
                {p.title} <span className="font-normal text-navy/70">· {format(money(p.priceMinor, "GHS"))}</span>
                <span className={`ml-2 rounded-full px-3 py-1 text-xs font-normal ${p.isPublished ? "bg-green-100 text-green-900" : "bg-navy/10"}`}>{p.isPublished ? "In the shop" : "Hidden"}</span>
                <span className={`ml-2 rounded-full px-3 py-1 text-xs font-normal ${p.fileId ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>{p.fileId ? `PDF: ${p.fileName} (${kb(p.fileSize ?? 0)})` : "No PDF yet"}</span>
              </p>
              <ActionForm className="inline" action={deleteProductAction} hidden={{ productId: p.id }} fields={[]} submitLabel="Delete" tone="danger" />
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold underline decoration-gold underline-offset-4">Edit</summary>
              <div className="mt-4 grid max-w-4xl gap-8 lg:grid-cols-2">
                <div><ActionForm action={updateProductAction} hidden={{ productId: p.id }} fields={fields(pictures, p)} submitLabel="Save changes" /></div>
                <div><ProductFileUploader productId={p.id} hasFile={!!p.fileId} /></div>
              </div>
            </details>
          </li>
        ))}
        {items.length === 0 ? <li className="text-navy/70">No products yet.</li> : null}
      </ul>
    </>
  );
}
