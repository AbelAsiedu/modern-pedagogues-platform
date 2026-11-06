import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import { listEditableContent } from "@/server/content/site-content";
import { requirePermission } from "@/server/context";
import { db } from "@/server/db";
import { saveContentAction } from "../actions";

export const metadata = { title: "Site text" };

export default async function ContentPage() {
  const s = await requirePermission("content.manage_site", "/admin/content");
  const groups = await listEditableContent(db(), s.actor);
  return (
    <>
      <h1>Site text</h1>
      <p className="mt-2 max-w-2xl text-sm text-navy/70">
        Edit the wording of every public page, the menu, the page titles shown in the browser tab and Google, and the business
        details (name, email, phone and Mobile Money number). Clear a box and save to bring back the original text. You can use{" "}
        <code>{"{name}"}</code>, <code>{"{email}"}</code>, <code>{"{phone}"}</code>, <code>{"{momo}"}</code>, <code>{"{momo_number}"}</code> and{" "}
        <code>{"{rate}"}</code> where they make sense; they always show the current business details. Slideshow pictures and
        buttons are edited under Home slideshow; pictures are managed in the Media library.
      </p>
      <div className="mt-8 space-y-4">
        {groups.map((g) => {
          const fields: FieldSpec[] = g.entries.map((x) => ({
            name: x.key,
            label: x.isCustom ? `${x.label} (edited)` : x.label,
            type: x.kind === "line" ? "text" : "textarea",
            defaultValue: x.value,
            hint: [x.kind === "lines" ? "One item per line." : null, x.help].filter(Boolean).join(" ") || undefined,
          }));
          return (
            <details key={g.id} className="rounded-2xl border border-navy/10 bg-white/70 p-5">
              <summary className="cursor-pointer text-lg font-semibold">
                {g.label}{" "}
                <span className="ml-2 text-sm font-normal text-navy/60">
                  {g.entries.filter((x) => x.isCustom).length} edited
                </span>
              </summary>
              <p className="mt-2 text-sm text-navy/70">{g.blurb}</p>
              <div className="mt-4 max-w-2xl">
                <ActionForm action={saveContentAction} hidden={{ group: g.id }} fields={fields} submitLabel={`Save ${g.label.toLowerCase()}`} />
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}
