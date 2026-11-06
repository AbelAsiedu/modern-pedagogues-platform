import { seoMetadata } from "@/server/seo";
import { Hero } from "@/components/site/Chrome";
import { format } from "@/lib/money";
import { INDICATIVE_TUTORING_RATE } from "@/lib/site";
import { getSiteText } from "@/server/context";

export const generateMetadata = () => seoMetadata("pricing");

export default async function Pricing() {
  const t = await getSiteText();
  return (
    <>
      <Hero kicker="Pricing" title={t.text("pricing.hero.title")}>
        <p>{t.text("pricing.hero.intro")}</p>
      </Hero>
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-2xl border-2 border-gold bg-white/60 p-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold">Tutoring</p>
          <p className="mt-2 text-4xl font-semibold">
            From {format(INDICATIVE_TUTORING_RATE)} <span className="text-lg font-normal">per session</span>
          </p>
          <p className="mt-3">{t.text("pricing.rate.note")}</p>
        </div>

        <h2 className="mt-12 text-2xl font-semibold">{t.text("pricing.how.heading")}</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-6">
          {t.lines("pricing.how.steps").map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>

        <h2 className="mt-12 text-2xl font-semibold">{t.text("pricing.paying.heading")}</h2>
        <p className="mt-3">{t.text("pricing.paying.body")}</p>

        <h2 className="mt-12 text-2xl font-semibold">{t.text("pricing.other.heading")}</h2>
        <p className="mt-3">{t.text("pricing.other.body")}</p>

        <div className="mt-10 flex flex-wrap gap-3">
          <a href={t.whatsapp(`Hello ${t.biz.name}, I would like a quote for tutoring.`)} className="rounded-full bg-navy px-6 py-3 font-semibold text-cream">
            Ask for a quote on WhatsApp
          </a>
          <a href={`mailto:${t.biz.email}?subject=Tutoring%20quote`} className="rounded-full border border-navy px-6 py-3 font-semibold">
            Email us
          </a>
        </div>
      </div>
    </>
  );
}
