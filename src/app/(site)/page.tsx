import Link from "next/link";
import { FeaturedResources } from "@/components/site/FeaturedResources";
import { HeroSlideshow } from "@/components/site/HeroSlideshow";
import { Marquee } from "@/components/site/Marquee";
import { Reveal } from "@/components/site/Reveal";
import { Testimonials } from "@/components/site/Testimonials";
import { parseTestimonials } from "@/lib/testimonials";
import { getPublicBannersOrDefaults } from "@/server/content/banners";
import { getSiteText } from "@/server/context";
import { db } from "@/server/db";
import { seoMetadata } from "@/server/seo";
import { listPublicProducts, type PublicProduct } from "@/server/shop/service";

export const dynamic = "force-dynamic";
export const generateMetadata = () => seoMetadata("home");

export default async function Home() {
  const [banners, t, resources] = await Promise.all([
    getPublicBannersOrDefaults(() => db()),
    getSiteText(),
    listPublicProducts(db()).catch((): PublicProduct[] => []),
  ]);
  const seconds = Number(t.text("home.slideshow.seconds")) || 6;
  const curricula = t.lines("home.curricula");
  const testimonials = parseTestimonials(t.lines("home.testimonials"));
  const biz = t.biz;
  return (
    <>
      <h1 className="sr-only">{t.text("seo.home.title")}</h1>
      <HeroSlideshow slides={banners} seconds={seconds} />

      {curricula.length > 0 ? (
        <div className="border-y border-navy/10 bg-cream-deep/70 py-4">
          <Marquee label="Curricula we support" seconds={Math.max(24, curricula.length * 8)}>
            {curricula.map((c) => (
              <span key={c} className="flex items-center gap-5 whitespace-nowrap text-sm font-semibold uppercase tracking-[0.16em] text-navy/80">
                {c}
                <span aria-hidden="true" className="text-gold">✦</span>
              </span>
            ))}
          </Marquee>
        </div>
      ) : null}

      <section className="mx-auto max-w-6xl px-6 py-16" aria-label="At a glance">
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <Reveal as="li" key={n} delay={n * 90} className="glass rounded-2xl p-5 text-center">
              <p className="text-2xl font-semibold tracking-tight md:text-3xl">{t.text(`home.stat${n}.value`)}</p>
              <p className="mt-1 text-sm text-navy/65">{t.text(`home.stat${n}.label`)}</p>
            </Reveal>
          ))}
        </ul>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-20 md:grid-cols-3">
        {[1, 2, 3].map((n) => (
          <Reveal key={n} delay={n * 110} className="lift glass relative overflow-hidden rounded-3xl p-8">
            <span aria-hidden="true" className="absolute -right-3 -top-6 text-9xl font-bold text-gold/15">{n}</span>
            <h2 className="relative text-xl font-semibold">{t.text(`home.pillar${n}.title`)}</h2>
            <p className="relative mt-3 leading-7 text-navy/80">{t.text(`home.pillar${n}.body`)}</p>
          </Reveal>
        ))}
      </section>

      <section className="bg-cream-deep/70">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Reveal>
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">{t.text("home.services.heading")}</h2>
          </Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <Reveal as="article" key={n} delay={(n % 3) * 90} className="lift rounded-2xl border border-navy/10 bg-white/80 p-7">
                <p className="text-sm font-semibold tracking-widest text-gold">0{n}</p>
                <h3 className="mt-2 text-lg font-semibold">{t.text(`services.${n}.title`)}</h3>
                <p className="mt-2 leading-7 text-navy/80">{t.text(`services.${n}.body`)}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{t.text("home.how.heading")}</h2>
        </Reveal>
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <Reveal as="li" key={n} delay={n * 120} className="relative border-t-2 border-gold pt-6">
              <span className="gradient-text text-5xl font-bold">0{n}</span>
              <h3 className="mt-3 text-lg font-semibold">{t.text(`home.how${n}.title`)}</h3>
              <p className="mt-2 leading-7 text-navy/80">{t.text(`home.how${n}.body`)}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <FeaturedResources items={resources} heading={t.text("home.resources.heading")} body={t.text("home.resources.body")} />

      <Testimonials items={testimonials} heading={t.text("home.testimonials.heading")} />

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight">{t.text("home.fees.heading")}</h2>
            <p className="mt-4 leading-7">{t.text("home.fees.body")}</p>
            <Link href="/pricing" className="mt-5 inline-block font-semibold underline decoration-gold underline-offset-4">
              How pricing works
            </Link>
          </Reveal>
          <Reveal delay={120} className="mesh relative overflow-hidden rounded-3xl p-8 text-cream">
            <div className="blob -right-10 -top-10 h-40 w-40 bg-gold/50" aria-hidden="true" />
            <p className="relative text-sm font-semibold uppercase tracking-widest text-gold">{t.text("home.talk.label")}</p>
            <p className="relative mt-3 text-xl leading-8">{t.text("home.talk.body")}</p>
            <p className="relative mt-4 text-sm">
              <a className="underline" href={`mailto:${biz.email}`}>{biz.email}</a> · {biz.phoneDisplay}
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-4">
        <Reveal className="mesh relative isolate overflow-hidden rounded-[2rem] px-8 py-16 text-center text-cream md:px-16">
          <div className="blob -left-10 top-0 h-56 w-56 bg-gold/50" aria-hidden="true" />
          <div className="blob -bottom-16 right-0 h-64 w-64 bg-sky-500/30 [animation-delay:-8s]" aria-hidden="true" />
          <h2 className="relative mx-auto max-w-2xl text-3xl font-semibold tracking-tight md:text-5xl">{t.text("home.cta.heading")}</h2>
          <p className="relative mx-auto mt-5 max-w-xl text-lg text-cream/80">{t.text("home.cta.body")}</p>
          <a
            href={t.whatsapp(`Hello ${biz.name}, I would like help finding a tutor.`)}
            className="pulse-ring relative mt-8 inline-flex items-center gap-2 rounded-full bg-gold px-8 py-4 font-semibold text-navy transition-transform hover:scale-[1.04]"
          >
            {t.text("home.cta.button")} <span aria-hidden="true">→</span>
          </a>
        </Reveal>
      </section>
    </>
  );
}
