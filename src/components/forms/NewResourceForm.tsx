"use client";

import { useRouter } from "next/navigation";
import { ActionForm, type FieldSpec } from "./ActionForm";
import type { ActionState } from "@/server/action-result";

/** "Add a resource": the details, the PDF and Publish now in one step. */
export function NewResourceForm({ fields }: { fields: readonly FieldSpec[] }) {
  const router = useRouter();
  async function submit(_: ActionState, form: FormData): Promise<ActionState> {
    const file = form.get("file");
    if (file instanceof File && file.size > 15 * 1024 * 1024) return { ok: false, error: "That file is too large (15 MB maximum)." };
    try {
      const res = await fetch("/api/admin/products", { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; fieldErrors?: Record<string, string[]>; published?: boolean; hasFile?: boolean } | null;
      if (!res.ok || !json?.ok) return { ok: false, error: json?.error ?? "That did not work. Please try again.", fieldErrors: json?.fieldErrors };
      router.refresh();
      return {
        ok: true,
        message: json.published
          ? "Added and published. It is now on the Resources page."
          : json.hasFile
            ? "Added, but hidden. Press “Show on Resources page” on it below when you are ready."
            : "Added as a draft. Upload its PDF below, then show it on the Resources page.",
      };
    } catch {
      return { ok: false, error: "The upload failed. Check your connection and try again." };
    }
  }
  return <ActionForm action={submit} fields={fields} submitLabel="Add resource" />;
}
