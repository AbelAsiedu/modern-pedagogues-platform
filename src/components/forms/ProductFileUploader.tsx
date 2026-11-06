"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

/** Uploads or replaces the PDF a product delivers to buyers. */
export function ProductFileUploader({ productId, hasFile }: { productId: string; hasFile: boolean }) {
  const uid = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) return setError("Choose a PDF first.");
    if (file.size > 15 * 1024 * 1024) return setError("That file is too large (15 MB maximum).");
    data.set("productId", productId);
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch("/api/admin/product-files", { method: "POST", body: data });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) setError(json?.error ?? "The upload failed. Please try again.");
      else {
        setDone(true);
        form.reset();
        router.refresh();
      }
    } catch {
      setError("The upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor={`${uid}-f`} className="font-medium">{hasFile ? "Replace the PDF" : "Upload the PDF"}</label>
        <input id={`${uid}-f`} name="file" type="file" accept="application/pdf,.pdf" required className="mt-1 w-full rounded-lg border border-navy/25 bg-white px-3 py-2 text-base" />
        <p className="mt-1 text-xs text-navy/70">PDF only, up to 15 MB. Paid resources are locked until the buyer’s payment is confirmed.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="rounded-full bg-navy px-5 py-2 text-sm font-semibold text-cream hover:bg-navy/90 disabled:opacity-60">{busy ? "Uploading…" : "Upload PDF"}</button>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        {done ? <p role="status" className="text-sm text-green-800">Uploaded.</p> : null}
      </div>
    </form>
  );
}
