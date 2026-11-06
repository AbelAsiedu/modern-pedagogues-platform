import type { Metadata } from "next";
import { Hero } from "@/components/site/Chrome";
import { CURRICULA_NAMES, whatsappLink } from "@/lib/site";
import { getSiteText } from "@/server/context";

export const metadata: Metadata = {
  title: "Services",
  description: "Home tuition, online and international support, Final Lap exam preparation, Pre-SHS Launchpad, and curriculum consulting.",
};

export default async function Services() {
  const t = await getSiteText();
  return (
    <>
      <Hero kicker="Services" title={t.text("services.hero.title")}>
        <p>{t.text("services.hero.intro")}</p>
      </Hero>
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 md:grid-cols-2">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <article key={n} className="border-t-2 border-gold pt-4">
              <p className="text-sm font-semibold text-gold">0{n}</p>
              <h2 className="mt-1 text-xl font-semibold">{t.text(`services.${n}.title`)}</h2>
              <p className="mt-2">{t.text(`services.${n}.body`)}</p>
            </article>
          ))}
        </div>

        <section className="mt-16">
          <h2 className="text-2xl font-semibold">{t.text("services.curricula.heading")}</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {CURRICULA_NAMES.map((c) => (
              <li key={c} className="rounded-full bg-cream-deep px-4 py-2 text-sm">{c}</li>
            ))}
          </ul>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-semibold">{t.text("services.tutors.heading")}</h2>
          <p className="mt-3 max-w-3xl">{t.text("services.tutors.body")}</p>
          <a
            href={whatsappLink("Hello TMP, I would like help choosing a programme for my ward.")}
            className="mt-6 inline-block rounded-full bg-navy px-6 py-3 font-semibold text-cream"
          >
            Get help choosing
          </a>
        </section>

        <section className="mt-16 rounded-2xl bg-cream-deep p-8">
          <h2 className="text-xl font-semibold">{t.text("services.soon.heading")}</h2>
          <p className="mt-2 max-w-3xl">{t.text("services.soon.body")}</p>
        </section>
      </div>
    </>
  );
}
