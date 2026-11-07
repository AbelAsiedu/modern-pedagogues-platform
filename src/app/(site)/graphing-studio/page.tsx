import Link from "next/link";
import { seoMetadata } from "@/server/seo";
import { Hero } from "@/components/site/Chrome";
import { SiteIcon, type SiteIconName } from "@/components/site/Brand";
import { GraphArt, OpenStudioButton, splitFeature } from "@/components/site/GraphingFeature";
import { SiteImage } from "@/components/site/SiteImage";
import { Reveal } from "@/components/site/Reveal";
import { getSiteText } from "@/server/context";

export const generateMetadata = () => seoMetadata("graphing");

/** Icons for the features, in the order the administrator lists them. */
const ICONS: SiteIconName[] = ["spark", "chart", "search", "award", "school"];

export default async function GraphingStudio() {
  const t = await getSiteText();
  const url = t.text("graphing.url");
  const features = t.lines("graphing.features.items").map(splitFeature);
  const picture = t.image("home.graphing.image");
  return (
    <>
      <Hero kicker={t.text("graphing.home.heading")} title={t.text("graphing.hero.title")} imageKey="page.graphing.image" icon="chart">
        <p>{t.text("graphing.hero.intro")}</p>
        <div className="mt-6">
          <OpenStudioButton url={url} label={t.text("graphing.button")} />
        </div>
      </Hero>
      <div className="mx-auto max-w-5xl px-6 pb-20 pt-6">
        <Reveal className="mesh overflow-hidden rounded-3xl p-3 shadow-xl md:p-4">
          <a href={url} target="_blank" rel="noopener noreferrer" className="group block" aria-label={`${t.text("graphing.home.heading")} (opens in a new tab)`}>
            <div className="aspect-[16/8] overflow-hidden rounded-2xl bg-navy/60">
              {picture ? <SiteImage path={picture} alt={t.imageAlt("home.graphing.image")} rounded="rounded-2xl" /> : <GraphArt className="h-full w-full p-4 transition-transform duration-500 group-hover:scale-[1.02]" />}
            </div>
          </a>
        </Reveal>

        <h2 className="mt-14 text-2xl font-semibold md:text-3xl">{t.text("graphing.features.heading")}</h2>
        <span className="mt-3 block h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal as="li" key={i} delay={i * 70} className="rounded-3xl border border-navy/10 bg-white p-6 shadow-sm">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-royal text-gold">
                <SiteIcon name={ICONS[i % ICONS.length]!} />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              {f.body ? <p className="mt-1.5 leading-7 text-navy/75">{f.body}</p> : null}
            </Reveal>
          ))}
        </ul>

        <Reveal className="mt-12 rounded-3xl border-2 border-gold bg-gold/15 p-8 md:p-10">
          <h2 className="text-2xl font-semibold md:text-3xl">{t.text("graphing.audience.heading")}</h2>
          <p className="mt-3 max-w-3xl text-lg leading-8 text-navy/85">{t.text("graphing.audience.body")}</p>
        </Reveal>

        <Reveal className="mesh relative mt-12 overflow-hidden rounded-3xl p-8 text-center text-cream shadow-xl md:p-12">
          <div className="blob -left-10 -bottom-10 h-44 w-44 bg-gold/30" aria-hidden="true" />
          <h2 className="relative mx-auto max-w-2xl text-3xl font-semibold md:text-4xl">{t.text("graphing.cta.heading")}</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-cream/90">{t.text("graphing.cta.body")}</p>
          <div className="relative mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <OpenStudioButton url={url} label={t.text("graphing.button")} />
            <Link href="/tutors" className="font-semibold text-gold underline decoration-gold/60 decoration-2 underline-offset-4 hover:decoration-gold">Find a tutor</Link>
            <Link href="/resources" className="font-semibold text-gold underline decoration-gold/60 decoration-2 underline-offset-4 hover:decoration-gold">Browse resources</Link>
          </div>
        </Reveal>
      </div>
    </>
  );
}
