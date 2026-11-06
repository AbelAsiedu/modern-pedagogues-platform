import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import { Hero } from "@/components/site/Chrome";
import { getSiteText } from "@/server/context";
import { db } from "@/server/db";
import { MODE_LABELS, TEACHING_MODES, tutorFilterOptions } from "@/server/tutors/service";
import { applyAsTutorAction } from "../actions";

export const metadata: Metadata = {
  title: "Become a tutor",
  description: "Apply to tutor with The Modern Pedagogues.",
};

export default async function Apply() {
  const t = await getSiteText();
  let options: Awaited<ReturnType<typeof tutorFilterOptions>> = { levels: [], curricula: [] };
  try {
    options = await tutorFilterOptions(db());
  } catch {
    /* the form still renders; submission will report any problem */
  }
  const fields: FieldSpec[] = [
    { name: "fullName", label: "Full name", required: true, autoComplete: "name" },
    { name: "email", label: "Email", type: "email", required: true, autoComplete: "email" },
    { name: "phone", label: "Phone / WhatsApp", type: "tel", required: true, autoComplete: "tel", hint: "Kept private. We only use it to contact you." },
    { name: "qualifications", label: "Qualifications", type: "textarea", required: true, hint: "Degrees, certificates, teaching registration. Kept private." },
    { name: "experience", label: "Teaching experience", type: "textarea", required: true, hint: "Where and what you have taught. Kept private." },
    { name: "subjects", label: "Subjects you teach", required: true, hint: "Separate with commas, e.g. Mathematics, Integrated Science." },
    { name: "levelKeys", label: "Levels", type: "checkboxes", required: true, options: options.levels.map((l) => ({ value: l.key, label: l.name })) },
    { name: "curriculumKeys", label: "Curricula", type: "checkboxes", options: options.curricula.map((c) => ({ value: c.key, label: c.name })) },
    { name: "modes", label: "Where you can teach", type: "checkboxes", required: true, options: TEACHING_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] })) },
    { name: "areas", label: "Areas you can travel to (optional)", hint: "Shown publicly, e.g. East Legon, Madina. No addresses." },
    { name: "yearsExperience", label: "Years of experience (optional)", type: "number" },
    { name: "availability", label: "Availability (optional)", hint: "Kept private." },
    {
      name: "bio",
      label: "Introduction for parents",
      type: "textarea",
      required: true,
      rows: 5,
      hint: "Shown on your public profile if you are approved. Do not include phone numbers, emails or links.",
    },
    { name: "consent", label: "I agree that, if approved, my first name, last initial and the profile details above may be shown on the TMP website, and I have read the privacy policy.", type: "checkbox" },
  ];
  return (
    <>
      <Hero kicker="Tutors" title={t.text("tutors.apply.heading")}>
        <p>{t.text("tutors.apply.intro")}</p>
      </Hero>
      <div className="mx-auto max-w-2xl px-6 py-12">
        <ActionForm action={applyAsTutorAction} fields={fields} submitLabel="Submit application" />
        <p className="mt-6 text-sm text-navy/70">
          Your name, email, phone, qualifications and experience stay private. See our <Link href="/privacy" className="underline">privacy policy</Link>.
        </p>
      </div>
    </>
  );
}
