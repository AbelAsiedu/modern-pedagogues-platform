import { seoMetadata } from "@/server/seo";
import { Hero } from "@/components/site/Chrome";
import { Reveal } from "@/components/site/Reveal";
import { RichText } from "@/components/site/RichText";
import { getSiteText } from "@/server/context";

export const generateMetadata = () => seoMetadata("about");

export default async function About() {
  const t = await getSiteText();
  return (
    <>
      <Hero kicker="About TMP" title={t.text("about.hero.title")} imageKey="page.about.image" icon="school">
        <p>{t.text("about.hero.intro")}</p>
      </Hero>
      <div className="mx-auto max-w-5xl px-6 pb-20 pt-6 leading-7">
        <h2 className="text-3xl font-semibold">{t.text("about.story.heading")}</h2>
        <span className="mt-3 block h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
        <div className="mt-6 max-w-3xl text-navy/85 [&_p]:mt-4">
          <RichText text={t.text("about.story.body")} />
        </div>
        <h2 className="mt-16 text-3xl font-semibold">{t.text("about.principles.heading")}</h2>
        <span className="mt-3 block h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <Reveal key={n} delay={n * 90} className="lift rounded-3xl border border-navy/10 bg-white p-7 shadow-sm">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-royal font-display text-lg font-bold text-gold">{n}</span>
              <h3 className="mt-4 font-semibold">{t.text(`about.principle${n}.title`)}</h3>
              <p className="mt-2 text-sm text-navy/75">{t.text(`about.principle${n}.body`)}</p>
            </Reveal>
          ))}
        </div>
        <p className="mesh mt-16 rounded-3xl px-8 py-10 text-center font-display text-2xl italic text-cream">{t.text("about.motto")}</p>
      </div>
    </>
  );
}
