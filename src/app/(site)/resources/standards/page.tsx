import type { Metadata } from "next";
import Link from "next/link";
import { Hero } from "@/components/site/Chrome";
import { RichText } from "@/components/site/RichText";
import { getSiteText } from "@/server/context";
import {
  AVERAGE_PASS, COVER_MIN_HEIGHT, COVER_MIN_WIDTH, CRITERIA, CRITERION_PASS, KIND_LABELS, MIN_PAGES, MIN_PAID_PRICE_CREATOR, RESOURCE_KINDS, SCORE_LABELS,
} from "@/server/resources/quality";

export const metadata: Metadata = {
  title: "Quality standard",
  description: "How every resource on The Modern Pedagogues is checked before it is listed: the automatic requirements and the reviewer's scoring criteria.",
};

export default async function Standards() {
  const t = await getSiteText();
  const minPrice = Number(MIN_PAID_PRICE_CREATOR) / 100;
  return (
    <>
      <Hero kicker="Resources" title="Our quality standard">
        <p>How a resource earns its place here.</p>
      </Hero>
      <div className="mx-auto max-w-4xl px-6 py-12 [&_p]:mt-4 [&_p]:leading-7">
        <div className="[&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold"><RichText text={t.text("resources.standards.intro")} /></div>

        <h2 className="mt-12 text-2xl font-semibold">1. Requirements checked before a reviewer reads it</h2>
        <p>A resource cannot be submitted until all of these are true. The creator’s page lists what is still missing.</p>
        <ul className="mt-3 list-disc space-y-2 pl-6 leading-7">
          <li>A clear title, a 60 to 240 character summary, and a description of at least 300 characters.</li>
          <li>A subject, at least one level, and the author’s name.</li>
          <li>At least three learning outcomes, each a full sentence, and a statement of who it is for.</li>
          <li>A table of contents for books, courses and study guides.</li>
          <li>A cover picture of at least {COVER_MIN_WIDTH}×{COVER_MIN_HEIGHT} pixels.</li>
          <li>A readable PDF (no password) with enough pages for its type: {RESOURCE_KINDS.map((k) => `${KIND_LABELS[k]} ${MIN_PAGES[k]}`).join(", ")}.</li>
          <li>No email addresses, web links or phone numbers in the listing text, and a PDF with no scripts, auto-launching actions or embedded files.</li>
          <li>Paid resources cost between GH₵ {minPrice} and GH₵ 5,000. Free resources are welcome.</li>
          <li>The creator’s signed declaration that the work is theirs or licensed, contains no personal data, is accurate, and follows the Creator terms.</li>
        </ul>

        <h2 className="mt-12 text-2xl font-semibold">2. What the reviewer scores</h2>
        <p>
          Every criterion is scored from 0 to 4 ({SCORE_LABELS.map((l, i) => `${i} ${l}`).join(", ")}). The first three are <strong>gates</strong>: a failure on any of them can never be made up for by strengths elsewhere.
        </p>
        <ol className="mt-4 space-y-4">
          {CRITERIA.map((c, i) => (
            <li key={c.key} className="rounded-2xl border border-navy/10 bg-white/70 p-5">
              <h3 className="font-semibold">
                {i + 1}. {c.label}
                {c.gate ? <span className="ml-2 rounded-full bg-navy px-2 py-0.5 text-xs font-normal text-cream">Gate</span> : null}
                {c.paidOnly ? <span className="ml-2 rounded-full bg-gold/30 px-2 py-0.5 text-xs font-normal">Paid resources only</span> : null}
              </h3>
              <p className="mt-2 text-sm leading-6">{c.question}</p>
              <p className="mt-2 text-sm leading-6"><strong>4, Excellent:</strong> {c.excellent}</p>
              <p className="text-sm leading-6"><strong>0, Unacceptable:</strong> {c.unacceptable}</p>
            </li>
          ))}
        </ol>

        <h2 className="mt-12 text-2xl font-semibold">3. How the decision is made</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 leading-7">
          <li><strong>Approved</strong> only if every criterion scores at least {CRITERION_PASS} ({SCORE_LABELS[CRITERION_PASS]}) and the average is at least {AVERAGE_PASS}. The listing then goes live.</li>
          <li><strong>Changes requested</strong> when it is close: the reviewer writes what to fix, and you resubmit.</li>
          <li><strong>Declined</strong> when it cannot reach the standard, for example copied material. The reasons are sent to you.</li>
          <li>A reviewer never reviews their own resources.</li>
        </ul>

        <h2 className="mt-12 text-2xl font-semibold">4. After approval</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 leading-7">
          <li>Changing what a reviewer judged (text, subject, cover or the PDF) takes the resource off the website until it is approved again. Changing only the price does not.</li>
          <li>We can take a resource down at once for a rights complaint or a safety problem. A taken-down resource cannot be downloaded by anyone, including earlier buyers, and TMP contacts them about a refund.</li>
        </ul>

        <p className="mt-10">
          <Link href="/creator/join" className="rounded-full bg-navy px-6 py-3 font-semibold text-cream hover:bg-navy/90">Become a creator</Link>{" "}
          <Link href="/resources" className="ml-4 underline decoration-gold underline-offset-4">Browse resources</Link>
        </p>
      </div>
    </>
  );
}
