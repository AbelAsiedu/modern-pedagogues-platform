import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/forms/ActionForm";
import { ImageUploader } from "@/components/forms/ImageUploader";
import { listingFields } from "@/lib/listing-form";
import { requireSession } from "@/server/context";
import { db } from "@/server/db";
import { mediaOptions } from "@/server/media/service";
import { getCreatorProfile } from "@/server/resources/creators";
import { resourceTaxonomy } from "@/server/resources/taxonomy";
import { createListingAction } from "../actions";

export const metadata: Metadata = { title: "New resource", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NewListing() {
  const s = await requireSession("/creator/new");
  const profile = await getCreatorProfile(db(), s.user.id);
  if (!profile) redirect("/creator/join");
  const [tax, pictures] = await Promise.all([resourceTaxonomy(db()), mediaOptions(db(), s.actor)]);
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/creator" className="text-sm underline">← Creator dashboard</Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">New resource</h1>
      <p className="mt-2 text-navy/80">
        Fill in the details first. On the next page you upload the PDF, check the list of what is still missing, and submit it for review. Read the{" "}
        <Link href="/resources/standards" className="font-semibold underline decoration-gold underline-offset-4">quality standard</Link> before you start.
      </p>

      <section className="mt-8 rounded-2xl border border-navy/10 bg-white/70 p-6">
        <h2 className="text-lg font-semibold">1. Upload a cover picture</h2>
        <p className="mt-1 text-sm text-navy/70">Pick it in the list below once it is uploaded. At least 600×400 pixels.</p>
        <div className="mt-4 max-w-xl"><ImageUploader label="Cover picture" /></div>
      </section>

      <section className="mt-6 rounded-2xl border border-navy/10 bg-white/70 p-6">
        <h2 className="text-lg font-semibold">2. Describe the resource</h2>
        <div className="mt-4"><ActionForm action={createListingAction} fields={listingFields({ ...tax, pictures })} submitLabel="Save and continue" /></div>
      </section>
    </div>
  );
}
