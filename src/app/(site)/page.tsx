import Link from "next/link";
import { HeroSlideshow } from "@/components/site/HeroSlideshow";
import { getPublicBannersOrDefaults } from "@/server/content/banners";
import { db } from "@/server/db";
import { format } from "@/lib/money";
import { CURRICULA_NAMES, INDICATIVE_TUTORING_RATE, SERVICES, SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function Home() {
  const banners = await getPublicBannersOrDefaults(() => db());
  return (
    <>
      <h1 className="sr-only">The Modern Pedagogues: tutoring, exam preparation and educational consulting</h1>
      <HeroSlideshow slides={banners}>
        <ul className="mt-8 flex flex-wrap gap-2 text-sm" aria-label="Curricula we support">
          {CURRICULA_NAMES.map((c) => (
            <li key={c} className="rounded-full border border-cream/30 px-3 py-1">{c}</li>
          ))}
        </ul>
      </HeroSlideshow>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-16 md:grid-cols-3">
        {[
          ["Pre-school to SHS", "Support at every stage of a learner's journey."],
          ["Ghanaian and international", "GES, Cambridge / British, Pearson Edexcel, IB and Canadian curricula."],
          ["Tracked progress", "Honest reporting every term, and a direct line to TMP, not just the tutor."],
        ].map(([t, d]) => (
          <div key={t} className="border-t-2 border-gold pt-4">
            <h2 className="text-lg font-semibold">{t}</h2>
            <p className="mt-2">{d}</p>
          </div>
        ))}
      </section>

      <section className="bg-cream-deep">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight">What we do</h2>
          <div className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <article key={s.title}>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="mt-2">{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Fees that fit the learner</h2>
            <p className="mt-4">
              Tutoring fees are agreed per learner, depending on level, subjects and schedule. Sessions start from{" "}
              <strong>{format(INDICATIVE_TUTORING_RATE)}</strong> per session, and we confirm the rate with you before the
              first lesson.
            </p>
            <Link href="/pricing" className="mt-4 inline-block font-semibold underline decoration-gold underline-offset-4">
              How pricing works
            </Link>
          </div>
          <div className="rounded-2xl bg-navy p-8 text-cream">
            <p className="text-sm font-semibold uppercase tracking-widest text-gold">Talk to us</p>
            <p className="mt-3 text-xl">Tell us what your ward needs next and we will suggest the right programme and tutor.</p>
            <p className="mt-4 text-sm">
              <a className="underline" href={`mailto:${SITE.email}`}>{SITE.email}</a> · {SITE.phoneDisplay}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
