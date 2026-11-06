import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/forms/ActionForm";
import { RichText } from "@/components/site/RichText";
import { getSiteText, requireSession } from "@/server/context";
import { db } from "@/server/db";
import { getCreatorProfile } from "@/server/resources/creators";
import { joinCreatorAction } from "../actions";

export const metadata: Metadata = { title: "Become a creator", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function JoinCreator() {
  const s = await requireSession("/creator/join");
  const [profile, t] = await Promise.all([getCreatorProfile(db(), s.user.id), getSiteText()]);
  if (profile) redirect("/creator");
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Become a creator</h1>
      <p className="mt-3 text-lg text-navy/80">{t.text("creator.join.intro")}</p>

      <section aria-labelledby="terms-h" className="mt-8">
        <h2 id="terms-h" className="text-xl font-semibold">Creator terms</h2>
        <div tabIndex={0} className="mt-3 max-h-80 overflow-y-auto rounded-2xl border border-navy/10 bg-white/70 p-5 text-sm leading-6 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-6">
          <RichText text={t.text("legal.creator_terms")} />
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-navy/10 bg-white/70 p-6">
        <h2 className="text-xl font-semibold">Your creator profile</h2>
        <div className="mt-4 max-w-xl">
          <ActionForm
            action={joinCreatorAction}
            submitLabel="Accept the terms and become a creator"
            fields={[
              { name: "displayName", label: "Name to show on your resources", required: true, defaultValue: s.user.fullName, hint: "Your own name or your organisation's name." },
              { name: "bio", label: "About you (optional)", type: "textarea", rows: 3, hint: "Your teaching background, in a sentence or two. No contact details or links." },
              { name: "payoutPhone", label: "Mobile Money number for payouts", type: "tel", autoComplete: "tel", hint: "Only TMP finance staff see this. You can add it later, but we cannot pay you without it." },
              { name: "acceptTerms", label: "I have read and accept the Creator terms", type: "checkbox" },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
