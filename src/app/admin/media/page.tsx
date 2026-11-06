import { ActionForm } from "@/components/forms/ActionForm";
import { ImageUploader } from "@/components/forms/ImageUploader";
import { requireSession } from "@/server/context";
import { db } from "@/server/db";
import { canUploadMedia, listMedia, mediaUsage } from "@/server/media/service";
import { notFound } from "next/navigation";
import { deleteMediaAction, updateMediaAltAction } from "../actions";

export const metadata = { title: "Media" };

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function MediaPage() {
  const s = await requireSession("/admin/media");
  if (!canUploadMedia(s.actor)) notFound();
  const items = await listMedia(db(), s.actor);
  const usage = new Map(await Promise.all(items.map(async (m) => [m.id, await mediaUsage(db(), m.path)] as const)));
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Media</h1>
      <p className="mt-2 max-w-2xl text-sm text-navy/70">
        Pictures for home banners, tutor photos and shop covers. Upload here, then choose the picture from the list when you edit a banner, tutor or product.
      </p>

      <section className="mt-8 rounded-2xl border border-navy/10 bg-white/70 p-6">
        <h2 className="text-xl font-semibold">Upload</h2>
        <div className="mt-4 max-w-xl"><ImageUploader /></div>
      </section>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((m) => {
          const used = usage.get(m.id) ?? [];
          return (
            <li key={m.id} className="rounded-2xl border border-navy/10 bg-white/70 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.path} alt={m.altText} className="h-40 w-full rounded-lg bg-cream-deep object-contain" />
              <p className="mt-3 truncate font-semibold" title={m.filename}>{m.filename}</p>
              <p className="text-xs text-navy/70">{m.width}×{m.height} · {kb(m.byteSize)} · {m.createdAt.toLocaleDateString("en-GB")}</p>
              <p className="mt-1 break-all text-xs text-navy/70">{m.path}</p>
              <p className="mt-1 text-xs">{used.length ? `In use: ${used.join(", ")}` : "Not in use"}</p>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold underline decoration-gold underline-offset-4">Edit</summary>
                <div className="mt-3 space-y-3">
                  <ActionForm action={updateMediaAltAction} hidden={{ mediaId: m.id }} fields={[{ name: "altText", label: "Description", defaultValue: m.altText }]} submitLabel="Save description" tone="quiet" />
                  <ActionForm action={deleteMediaAction} hidden={{ mediaId: m.id }} fields={[]} submitLabel="Delete picture" tone="danger" />
                </div>
              </details>
            </li>
          );
        })}
        {items.length === 0 ? <li className="text-navy/70">No pictures yet.</li> : null}
      </ul>
    </>
  );
}
