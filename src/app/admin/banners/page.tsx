import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import { listAllBanners } from "@/server/content/banners";
import { ImageUploader } from "@/components/forms/ImageUploader";
import { requirePermission } from "@/server/context";
import { mediaOptions } from "@/server/media/service";
import { db } from "@/server/db";
import { createBannerAction, deleteBannerAction, toggleBannerAction, updateBannerAction } from "../actions";

export const metadata = { title: "Home slideshow" };

const KNOWN_IMAGES = ["/images/slide-learning.svg", "/images/slide-exams.svg", "/images/slide-team.svg"] as const;

function fields(pictures: readonly { value: string; label: string }[], b?: { title: string; subtitle: string | null; imagePath: string; imageAlt: string; buttonText: string | null; buttonUrl: string | null; isActive: boolean; sortOrder: number }): FieldSpec[] {
  return [
    { name: "title", label: "Headline", required: true, defaultValue: b?.title },
    { name: "subtitle", label: "Supporting text", type: "textarea", defaultValue: b?.subtitle ?? "" },
    { name: "imagePath", label: "Picture", type: "select", required: true, defaultValue: b?.imagePath ?? KNOWN_IMAGES[0], options: pictureChoices(pictures, b?.imagePath), hint: "Upload new pictures just below, or under Media, then pick one here." },
    { name: "imageAlt", label: "Image description (for screen readers)", defaultValue: b?.imageAlt ?? "" },
    { name: "buttonText", label: "Button text", defaultValue: b?.buttonText ?? "" },
    { name: "buttonUrl", label: "Button link", defaultValue: b?.buttonUrl ?? "", hint: "A page like /contact, an https:// link, mailto: or tel:." },
    { name: "sortOrder", label: "Order (lowest first)", type: "number", defaultValue: b?.sortOrder ?? 0 },
    { name: "isActive", label: "Show on the home page", type: "checkbox", defaultValue: b?.isActive ?? true },
  ];
}

const BUILT_IN = KNOWN_IMAGES.map((p) => ({ value: p, label: `Built-in: ${p.replace("/images/slide-", "").replace(".svg", "")}` }));
/** Built-in art, then uploads. A picture that was deleted but is still set stays selectable so saving does not silently change it. */
function pictureChoices(pictures: readonly { value: string; label: string }[], current?: string) {
  const all = [...BUILT_IN, ...pictures];
  return current && !all.some((o) => o.value === current) ? [{ value: current, label: `${current} (missing)` }, ...all] : all;
}

export default async function BannersPage() {
  const s = await requirePermission("content.manage_site", "/admin/banners");
  const banners = await listAllBanners(db(), s.actor);
  const pictures = await mediaOptions(db(), s.actor);
  return (
    <>
      <h1>Home slideshow</h1>
      <p className="mt-2 max-w-2xl text-sm text-navy/70">
        Showing slides loop automatically at the top of the home page, lowest order first, and visitors can pause them. If none are showing, TMP&apos;s default slides are used. The seconds per slide is set under Site text, Home page.
      </p>

      <section className="mt-8 rounded-2xl border border-navy/10 bg-white/70 p-6">
        <h2 className="text-xl font-semibold">Upload a picture</h2>
        <div className="mt-4 max-w-xl"><ImageUploader /></div>
      </section>

      <section className="mt-6 rounded-2xl border border-navy/10 bg-white/70 p-6">
        <h2 className="text-xl font-semibold">Add a banner</h2>
        <div className="mt-4 max-w-xl">
          <ActionForm action={createBannerAction} fields={fields(pictures)} submitLabel="Add banner" />
        </div>
      </section>

      <ul className="mt-8 space-y-4">
        {banners.map((b) => (
          <li key={b.id} className="rounded-2xl border border-navy/10 bg-white/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.imagePath} alt="" className="h-14 w-20 rounded-lg bg-cream-deep object-cover" />
              <p className="min-w-0 flex-1 font-semibold">
                {b.title}{" "}
                <span className={`ml-2 rounded-full px-3 py-1 text-xs font-normal ${b.isActive ? "bg-green-100 text-green-900" : "bg-navy/10"}`}>
                  {b.isActive ? "Showing" : "Hidden"}
                </span>
              </p>
              <div className="flex gap-2">
                <ActionForm className="inline" action={toggleBannerAction} hidden={{ bannerId: b.id, active: String(!b.isActive) }} fields={[]} submitLabel={b.isActive ? "Hide" : "Show"} tone="quiet" />
                <ActionForm className="inline" action={deleteBannerAction} hidden={{ bannerId: b.id }} fields={[]} submitLabel="Delete" tone="danger" />
              </div>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold underline decoration-gold underline-offset-4">Edit</summary>
              <div className="mt-4 max-w-xl">
                <ActionForm action={updateBannerAction} hidden={{ bannerId: b.id }} fields={fields(pictures, b)} submitLabel="Save changes" />
              </div>
            </details>
          </li>
        ))}
        {banners.length === 0 ? <li className="text-navy/70">No custom banners yet. The default slides are showing.</li> : null}
      </ul>
    </>
  );
}
