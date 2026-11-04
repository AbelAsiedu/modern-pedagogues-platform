import type { Metadata } from "next";
import { Hero } from "@/components/site/Chrome";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: "The Modern Pedagogues was founded in 2019 on the belief that education should not stay frozen in the past.",
};

export default function About() {
  return (
    <>
      <Hero kicker="About TMP" title="Education should keep moving forward">
        <p>{SITE.name} was founded in {SITE.founded} on the belief that education should not stay frozen in the past.</p>
      </Hero>
      <div className="mx-auto max-w-3xl px-6 py-16 leading-7">
        <h2 className="text-2xl font-semibold">Built around the student</h2>
        <p className="mt-4">
          Every ward learns differently, so we build around the student, not a fixed syllabus delivered the same way to
          everyone. That means qualified tutors, a plan tailored to how each ward learns, tracked progress, and honest
          reporting, every term.
        </p>
        <p className="mt-4">
          We work across Pre-school, Primary, JHS and SHS, and across Ghanaian, British, Pearson Edexcel, IB and Canadian
          curricula.
        </p>
        <h2 className="mt-12 text-2xl font-semibold">Our principles</h2>
        <div className="mt-6 grid gap-8 md:grid-cols-3">
          {[
            ["Personalised learning", "Plans respond to how each ward learns, what they need now and where they want to go next."],
            ["Qualified educators", "Every tutor is assessed, trained and supported as part of one coordinated team."],
            ["Honest progress", "Parents receive tracked progress and clear reporting, not vague promises."],
          ].map(([t, d]) => (
            <div key={t} className="border-t-2 border-gold pt-3">
              <h3 className="font-semibold">{t}</h3>
              <p className="mt-2 text-sm">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-12 italic">{SITE.motto}</p>
      </div>
    </>
  );
}
