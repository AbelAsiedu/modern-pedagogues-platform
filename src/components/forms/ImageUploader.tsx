"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

/** Uploads one picture to the media library, then refreshes the page so it appears in the lists and pickers. */
export function ImageUploader({ label = "Upload a picture", replaceId, submitLabel = "Upload" }: { label?: string; replaceId?: string; submitLabel?: string }) {
  const uid = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    if (replaceId) data.set("replaceId", replaceId);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose an image first.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("That image is too large (5 MB maximum).");
      return;
    }
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/admin/media", { method: "POST", body: data });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; path?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "The upload failed. Please try again.");
      } else {
        setDone(replaceId ? "Replaced everywhere it was used." : `Uploaded. Its address is ${json.path}`);
        form.reset();
        router.refresh();
      }
    } catch {
      setError("The upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-navy/25 bg-white px-3 py-2 text-base focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40";
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor={`${uid}-file`} className="font-medium">{label}</label>
        <input id={`${uid}-file`} name="file" type="file" accept="image/jpeg,image/png,image/webp" required className={input} />
        <p className="mt-1 text-xs text-navy/70">JPEG, PNG or WebP, up to 5 MB. It is resized to at most 2000 pixels and location data is removed.</p>
      </div>
      <div>
        <label htmlFor={`${uid}-alt`} className="font-medium">Description (for screen readers)</label>
        <input id={`${uid}-alt`} name="altText" type="text" maxLength={200} className={input} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="rounded-full bg-navy px-5 py-2 text-sm font-semibold text-cream hover:bg-navy/90 disabled:opacity-60">
          {busy ? "Working…" : submitLabel}
        </button>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        {done ? <p role="status" className="text-sm text-green-800">{done}</p> : null}
      </div>
    </form>
  );
}
