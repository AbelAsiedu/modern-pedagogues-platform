import { ActionForm } from "@/components/forms/ActionForm";
import { ImageUploader } from "@/components/forms/ImageUploader";
import { requirePermission } from "@/server/context";
import { db } from "@/server/db";
import { listImageSlots } from "@/server/content/images";
import { mediaOptions } from "@/server/media/service";
import { setImageSlotAction } from "../actions";

export const metadata = { title: "Site images" };

export default async function SiteImagesPage() {
  const s = await requirePermission("content.manage_site", "/admin/images");
  const [slots, pictures] = await Promise.all([listImageSlots(db(), s.actor), mediaOptions(db(), s.actor)]);
  const groups = [
    { title: "Logo", slots: slots.filter((x) => x.key === "site.logo") },
    { title: "Home page", slots: slots.filter((x) => x.key.startsWith("home.")) },
    { title: "Page banners", slots: slots.filter((x) => x.key.startsWith("page.")) },
  ];
  return (
    <>
      <h1>Site images</h1>
      <p className="mt-2 max-w-2xl text-sm text-navy/70">
        Every picture on the public pages comes from here. Upload straight into a place, or choose a picture you already uploaded to the Media library.
        Until you add one, a tidy built-in illustration is shown. The slideshow pictures are under Home slideshow, tutor photos are on each tutor, and
        resource covers are on each resource.
      </p>
      <div className="mt-8 space-y-10">
        {groups.map((g) => (
          <section key={g.title} aria-labelledby={`g-${g.title}`}>
            <h2 id={`g-${g.title}`} className="text-sm font-semibold uppercase tracking-[0.14em] text-navy/55">{g.title}</h2>
            <ul className="mt-3 grid gap-4 lg:grid-cols-2">
              {g.slots.map((x) => (
                <li key={x.key} className="rounded-2xl border border-navy/10 bg-white/70 p-5">
                  <div className="flex gap-4">
                    {x.path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={x.path} alt={x.alt} className="h-24 w-32 shrink-0 rounded-lg bg-cream-deep object-cover" />
                    ) : (
                      <div className="grid h-24 w-32 shrink-0 place-items-center rounded-lg bg-cream-deep px-2 text-center text-xs text-navy/60">Built-in illustration</div>
                    )}
                    <div className="min-w-0">
                      <h3 className="font-semibold">{x.label}</h3>
                      <p className="mt-1 text-xs text-navy/65">{x.help}</p>
                    </div>
                  </div>
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-semibold underline decoration-gold underline-offset-4">{x.path ? "Change or remove" : "Add a picture"}</summary>
                    <div className="mt-4 space-y-4">
                      <ImageUploader label="Upload a new picture" slot={x.key} submitLabel="Upload and use" />
                      {pictures.length > 0 ? (
                        <ActionForm
                          action={setImageSlotAction}
                          hidden={{ slot: x.key }}
                          fields={[{ name: "path", label: "Or choose from the Media library", type: "select", defaultValue: x.path, options: [{ value: "", label: "Use the built-in illustration" }, ...pictures] }]}
                          submitLabel="Use this picture"
                          tone="quiet"
                        />
                      ) : null}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
