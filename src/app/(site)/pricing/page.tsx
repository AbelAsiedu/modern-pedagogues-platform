import { notFound } from "next/navigation";
import { seoMetadata } from "@/server/seo";
import { Hero } from "@/components/site/Chrome";
import { SiteIcon, type SiteIconName } from "@/components/site/Brand";
import { Reveal } from "@/components/site/Reveal";
import { format } from "@/lib/money";
import { INDICATIVE_TUTORING_RATE, PRICING_PAGE_ENABLED } from "@/lib/site";
import { getSiteText } from "@/server/context";

export const generateMetadata = () => seoMetadata("pricing");

/** Icons for the four things that shape a fee, in the order the admin lists them. */
const FACTOR_ICONS: SiteIconName[] = ["book", "school", "chart", "search"];

/** "Title | Description" -> parts. A line without a bar is all description. */
function splitItem(line: string): { title: string; body: string } {
  const i = line.indexOf("|");
  return i < 0 ? { title: "", body: line.trim() } : { title: line.slice(0, i).trim(), body: line.slice(i + 1).trim() };
}

export default async function Pricing() {
  if (!PRICING_PAGE_ENABLED) notFound();
  const t = await getSiteText();
  const factors = t.lines("pricing.factors.items").map(splitItem);
  const promises = t.lines("pricing.promise.items");
  return (
    <>
      <Hero kicker="Pricing" title={t.text("pricing.hero.title")} imageKey="page.pricing.image" icon="award">
        <p>{t.text("pricing.hero.intro")}</p>
      </Hero>
      <div className="mx-auto max-w-5xl px-6 pb-20 pt-6">
        <Reveal className="mesh relative overflow-hidden rounded-3xl p-8 text-cream shadow-xl md:p-10">
          <div className="blob -right-10 -top-10 h-44 w-44 bg-gold/30" aria-hidden="true" />
          <p className="relative text-sm font-semibold uppercase tracking-widest text-gold">Tutoring</p>
          <p className="relative mt-2 font-display text-4xl font-semibold md:text-5xl">
            From {format(INDICATIVE_TUTORING_RATE)} <span className="font-sans text-lg font-normal text-cream/80">per session</span>
          </p>
          <p className="relative mt-3 max-w-2xl text-cream/90">{t.text("pricing.rate.note")}</p>
        </Reveal>

        <h2 className="mt-14 text-2xl font-semibold md:text-3xl">{t.text("pricing.factors.heading")}</h2>
        <span className="mt-3 block h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {factors.map((f, i) => (
            <Reveal as="li" key={i} delay={i * 80} className="rounded-3xl border border-navy/10 bg-white p-6 shadow-sm">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-royal text-gold">
                <SiteIcon name={FACTOR_ICONS[i % FACTOR_ICONS.length]!} />
              </span>
              {f.title ? <h3 className="mt-4 text-lg font-semibold">{f.title}</h3> : null}
              <p className={`${f.title ? "mt-1.5" : "mt-4"} leading-7 text-navy/75`}>{f.body}</p>
            </Reveal>
          ))}
        </ul>

        <Reveal className="relative mt-12 overflow-hidden rounded-3xl border-2 border-gold bg-gold/15 p-8 md:p-10">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold text-navy">
              <SiteIcon name="check" className="h-6 w-6" stroke={2.4} />
            </span>
            <div>
              <h2 className="text-2xl font-semibold md:text-3xl">{t.text("pricing.assessment.heading")}</h2>
              <p className="mt-3 max-w-3xl text-lg leading-8 text-navy/85">{t.text("pricing.assessment.body")}</p>
            </div>
          </div>
        </Reveal>

        <h2 className="mt-14 text-2xl font-semibold md:text-3xl">{t.text("pricing.how.heading")}</h2>
        <span className="mt-3 block h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
        <ol className="mt-6 space-y-3">
          {t.lines("pricing.how.steps").map((step, i) => (
            <Reveal as="li" key={i} delay={i * 70} className="flex gap-4 rounded-2xl border border-navy/10 bg-white p-5 shadow-sm">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-royal font-display font-bold text-gold">{i + 1}</span>
              <span className="pt-1">{step}</span>
            </Reveal>
          ))}
        </ol>

        {promises.length > 0 ? (
          <section className="mt-14 rounded-3xl bg-royal/5 p-8 md:p-10">
            <h2 className="text-2xl font-semibold md:text-3xl">{t.text("pricing.promise.heading")}</h2>
            <ul className="mt-5 grid gap-x-8 gap-y-3 md:grid-cols-2">
              {promises.map((p, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-royal text-gold">
                    <SiteIcon name="check" className="h-4 w-4" stroke={2.6} />
                  </span>
                  <span className="leading-7 text-navy/85">{p}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <section className="rounded-3xl border border-navy/10 bg-white p-7 shadow-sm">
            <h2 className="text-xl font-semibold">{t.text("pricing.paying.heading")}</h2>
            <p className="mt-3 text-navy/80">{t.text("pricing.paying.body")}</p>
          </section>
          <section className="rounded-3xl border border-navy/10 bg-white p-7 shadow-sm">
            <h2 className="text-xl font-semibold">{t.text("pricing.other.heading")}</h2>
            <p className="mt-3 text-navy/80">{t.text("pricing.other.body")}</p>
          </section>
        </div>

        <Reveal className="mesh relative mt-12 overflow-hidden rounded-3xl p-8 text-center text-cream shadow-xl md:p-12">
          <div className="blob -left-10 -bottom-10 h-44 w-44 bg-gold/30" aria-hidden="true" />
          <h2 className="relative mx-auto max-w-2xl text-3xl font-semibold md:text-4xl">{t.text("pricing.cta.heading")}</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-cream/90">{t.text("pricing.cta.body")}</p>
          <div className="relative mt-7 flex flex-wrap justify-center gap-3">
            <a href={t.whatsapp(`Hello ${t.biz.name}, I would like to arrange an assessment for my child.`)} className="rounded-full bg-gold px-7 py-3.5 font-semibold text-navy shadow-lg transition-transform hover:scale-[1.03]">
              Book an assessment on WhatsApp
            </a>
            <a href={`mailto:${t.biz.email}?subject=Tutoring%20assessment`} className="rounded-full border-2 border-cream/70 px-7 py-3 font-semibold text-cream transition-colors hover:bg-cream hover:text-navy">
              Email us
            </a>
          </div>
        </Reveal>
      </div>
    </>
  );
}
