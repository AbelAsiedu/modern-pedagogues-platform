import { notFound } from "next/navigation";
import { seoMetadata } from "@/server/seo";
import { Hero } from "@/components/site/Chrome";
import { format } from "@/lib/money";
import { INDICATIVE_TUTORING_RATE, PRICING_PAGE_ENABLED } from "@/lib/site";
import { getSiteText } from "@/server/context";

export const generateMetadata = () => seoMetadata("pricing");

export default async function Pricing() {
  if (!PRICING_PAGE_ENABLED) notFound();
  const t = await getSiteText();
  return (
    <>
      <Hero kicker="Pricing" title={t.text("pricing.hero.title")} imageKey="page.pricing.image" icon="award">
        <p>{t.text("pricing.hero.intro")}</p>
      </Hero>
      <div className="mx-auto max-w-4xl px-6 pb-20 pt-6">
        <div className="mesh relative overflow-hidden rounded-3xl p-8 text-cream shadow-xl md:p-10">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold">Tutoring</p>
          <p className="mt-2 font-display text-4xl font-semibold md:text-5xl">
            From {format(INDICATIVE_TUTORING_RATE)} <span className="font-sans text-lg font-normal text-cream/80">per session</span>
          </p>
          <p className="mt-3 max-w-2xl text-cream/90">{t.text("pricing.rate.note")}</p>
        </div>

        <h2 className="mt-14 text-2xl font-semibold md:text-3xl">{t.text("pricing.how.heading")}</h2>
        <span className="mt-3 block h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
        <ol className="mt-6 space-y-3">
          {t.lines("pricing.how.steps").map((step, i) => (
            <li key={i} className="flex gap-4 rounded-2xl border border-navy/10 bg-white p-5 shadow-sm">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-royal font-display font-bold text-gold">{i + 1}</span>
              <span className="pt-1">{step}</span>
            </li>
          ))}
        </ol>

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

        <div className="mt-10 flex flex-wrap gap-3">
          <a href={t.whatsapp(`Hello ${t.biz.name}, I would like a quote for tutoring.`)} className="rounded-full bg-gold px-7 py-3.5 font-semibold text-navy shadow-lg transition-transform hover:scale-[1.03]">
            Ask for a quote on WhatsApp
          </a>
          <a href={`mailto:${t.biz.email}?subject=Tutoring%20quote`} className="rounded-full border-2 border-royal px-7 py-3 font-semibold text-royal transition-colors hover:bg-royal hover:text-cream">
            Email us
          </a>
        </div>
      </div>
    </>
  );
}
