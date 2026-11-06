import Link from "next/link";
import { HeroSlideshow } from "@/components/site/HeroSlideshow";
import { getPublicBannersOrDefaults } from "@/server/content/banners";
import { getSiteText } from "@/server/context";
import { db } from "@/server/db";
import { CURRICULA_NAMES, SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [banners, t] = await Promise.all([getPublicBannersOrDefaults(() => db()), getSiteText()]);
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
        {[1, 2, 3].map((n) => (
          <div key={n} className="border-t-2 border-gold pt-4">
            <h2 className="text-lg font-semibold">{t.text(`home.pillar${n}.title`)}</h2>
            <p className="mt-2">{t.text(`home.pillar${n}.body`)}</p>
          </div>
        ))}
      </section>

      <section className="bg-cream-deep">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight">{t.text("home.services.heading")}</h2>
          <div className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <article key={n}>
                <h3 className="text-lg font-semibold">{t.text(`services.${n}.title`)}</h3>
                <p className="mt-2">{t.text(`services.${n}.body`)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">{t.text("home.fees.heading")}</h2>
            <p className="mt-4">{t.text("home.fees.body")}</p>
            <Link href="/pricing" className="mt-4 inline-block font-semibold underline decoration-gold underline-offset-4">
              How pricing works
            </Link>
          </div>
          <div className="rounded-2xl bg-navy p-8 text-cream">
            <p className="text-sm font-semibold uppercase tracking-widest text-gold">{t.text("home.talk.label")}</p>
            <p className="mt-3 text-xl">{t.text("home.talk.body")}</p>
            <p className="mt-4 text-sm">
              <a className="underline" href={`mailto:${SITE.email}`}>{SITE.email}</a> · {SITE.phoneDisplay}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
