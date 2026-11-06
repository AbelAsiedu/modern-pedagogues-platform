import { seoMetadata } from "@/server/seo";
import { SiteIcon, type SiteIconName } from "@/components/site/Brand";
import { Hero } from "@/components/site/Chrome";
import { ServiceCard } from "@/components/site/ServiceCard";
import { getSiteText } from "@/server/context";

export const generateMetadata = () => seoMetadata("services");

const ICONS: SiteIconName[] = ["cap", "users", "award", "school", "chart", "book"];

export default async function Services() {
  const t = await getSiteText();
  return (
    <>
      <Hero kicker="Services" title={t.text("services.hero.title")} imageKey="page.services.image" icon="cap">
        <p>{t.text("services.hero.intro")}</p>
      </Hero>
      <div className="mx-auto max-w-6xl px-6 pb-20 pt-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <ServiceCard
              key={n}
              n={n}
              icon={ICONS[n - 1]!}
              title={t.text(`services.${n}.title`)}
              body={t.text(`services.${n}.body`)}
              image={t.image(`service.${n}.image`) || undefined}
              imageAlt={t.imageAlt(`service.${n}.image`)}
              heading="h2"
            />
          ))}
        </div>

        <section className="mt-20">
          <h2 className="text-2xl font-semibold md:text-3xl">{t.text("services.curricula.heading")}</h2>
          <span className="mt-3 block h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
          <ul className="mt-6 flex flex-wrap gap-2">
            {t.lines("home.curricula").map((c) => (
              <li key={c} className="rounded-full border border-royal/20 bg-cream-deep px-4 py-2 text-sm font-medium text-royal-deep">{c}</li>
            ))}
          </ul>
        </section>

        <section className="mt-16 grid items-center gap-8 rounded-3xl bg-cream-deep p-8 md:grid-cols-[1fr_auto] md:p-10">
          <div>
            <h2 className="text-2xl font-semibold">{t.text("services.tutors.heading")}</h2>
            <p className="mt-3 max-w-3xl leading-7 text-navy/80">{t.text("services.tutors.body")}</p>
          </div>
          <a
            href={t.whatsapp(`Hello ${t.biz.name}, I would like help choosing a programme for my ward.`)}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-gold px-7 py-3.5 font-semibold text-navy shadow-lg transition-transform hover:scale-[1.03]"
          >
            Get help choosing <SiteIcon name="arrow" className="h-4 w-4" stroke={2.2} />
          </a>
        </section>

        <section className="mt-10 rounded-3xl border border-dashed border-royal/30 p-8">
          <h2 className="font-sans text-xl font-semibold">{t.text("services.soon.heading")}</h2>
          <p className="mt-2 max-w-3xl text-navy/75">{t.text("services.soon.body")}</p>
        </section>
      </div>
    </>
  );
}
