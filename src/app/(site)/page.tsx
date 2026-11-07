import Link from "next/link";
import { SiteIcon, type SiteIconName } from "@/components/site/Brand";
import { FeaturedResources } from "@/components/site/FeaturedResources";
import { GraphingFeature } from "@/components/site/GraphingFeature";
import { HeroSlideshow } from "@/components/site/HeroSlideshow";
import { Marquee } from "@/components/site/Marquee";
import { Reveal } from "@/components/site/Reveal";
import { ServiceCard } from "@/components/site/ServiceCard";
import { SiteImage } from "@/components/site/SiteImage";
import { Testimonials } from "@/components/site/Testimonials";
import { TutorCard } from "@/components/site/TutorCard";
import { PRICING_PAGE_ENABLED } from "@/lib/site";
import { parseTestimonials } from "@/lib/testimonials";
import { getPublicBannersOrDefaults } from "@/server/content/banners";
import { getSiteText } from "@/server/context";
import { db } from "@/server/db";
import { seoMetadata } from "@/server/seo";
import { listPublicProducts, type PublicProduct } from "@/server/shop/service";
import { listPublicTutors, type PublicTutor } from "@/server/tutors/service";

export const dynamic = "force-dynamic";
export const generateMetadata = () => seoMetadata("home");

const SERVICE_ICONS: SiteIconName[] = ["cap", "users", "award", "school", "chart", "book"];

function SectionHeading({ title, sub, id, center = true }: { title: string; sub?: string; id?: string; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <h2 id={id} className="text-3xl font-semibold tracking-tight md:text-[2.5rem]">{title}</h2>
      <span className={`mt-4 block h-1 w-14 rounded-full bg-gold ${center ? "mx-auto" : ""}`} aria-hidden="true" />
      {sub ? <p className="mt-4 text-navy/70">{sub}</p> : null}
    </div>
  );
}

export default async function Home() {
  const [banners, t, resources, tutors] = await Promise.all([
    getPublicBannersOrDefaults(() => db()),
    getSiteText(),
    listPublicProducts(db()).catch((): PublicProduct[] => []),
    listPublicTutors(db(), {}).catch((): PublicTutor[] => []),
  ]);
  const seconds = Number(t.text("home.slideshow.seconds")) || 6;
  const curricula = t.lines("home.curricula");
  const testimonials = parseTestimonials(t.lines("home.testimonials"));
  const biz = t.biz;
  return (
    <>
      <h1 className="sr-only">{t.text("seo.home.title")}</h1>
      <HeroSlideshow slides={banners} seconds={seconds} kicker={t.text("home.hero.kicker")} searchHint={t.text("home.hero.search")} />

      {curricula.length > 0 ? (
        <div className="border-b border-navy/10 bg-cream-deep py-4">
          <Marquee label="Curricula we support" seconds={Math.max(24, curricula.length * 8)}>
            {curricula.map((c) => (
              <span key={c} className="flex items-center gap-5 whitespace-nowrap text-sm font-bold uppercase tracking-[0.16em] text-royal-deep">
                {c}
                <span aria-hidden="true" className="text-gold">✦</span>
              </span>
            ))}
          </Marquee>
        </div>
      ) : null}

      {/* Services */}
      <section className="mx-auto max-w-6xl px-6 py-20" aria-labelledby="services-h">
        <Reveal><SectionHeading id="services-h" title={t.text("home.services.heading")} sub={t.text("home.services.sub")} /></Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <ServiceCard
              key={n}
              n={n}
              icon={SERVICE_ICONS[n - 1]!}
              title={t.text(`services.${n}.title`)}
              body={t.text(`services.${n}.body`)}
              image={t.image(`service.${n}.image`) || undefined}
              imageAlt={t.imageAlt(`service.${n}.image`)}
              heading="h3"
            />
          ))}
        </div>
      </section>

      {/* Graphing Studio */}
      <GraphingFeature t={t} />

      {/* Building a brighter future */}
      <section className="bg-cream-deep">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:grid-cols-2">
          <Reveal className="relative">
            <div className="absolute -bottom-4 -left-4 h-full w-full rounded-3xl bg-gold" aria-hidden="true" />
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl shadow-2xl shadow-navy/20">
              <SiteImage path={t.image("home.about.image") || undefined} alt={t.imageAlt("home.about.image")} icon="users" />
            </div>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="text-3xl font-semibold tracking-tight md:text-[2.5rem]">{t.text("home.about.heading")}</h2>
            <span className="mt-4 block h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
            <p className="mt-5 leading-7 text-navy/80">{t.text("home.about.body")}</p>
            <ul className="mt-6 space-y-4">
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-royal text-gold"><SiteIcon name="check" className="h-3.5 w-3.5" stroke={3} /></span>
                  <span><strong className="font-semibold">{t.text(`home.pillar${n}.title`)}.</strong> <span className="text-navy/75">{t.text(`home.pillar${n}.body`)}</span></span>
                </li>
              ))}
            </ul>
            <Link href="/about" className="mt-8 inline-flex items-center gap-2 rounded-full bg-royal-deep px-7 py-3.5 font-semibold text-cream transition-transform hover:scale-[1.03] hover:bg-navy">
              {t.text("home.about.button")} <SiteIcon name="arrow" className="h-4 w-4" stroke={2.2} />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Our impact */}
      <section className="mx-auto max-w-6xl px-6 py-20" aria-labelledby="impact-h">
        <div className="grid items-center gap-12 md:grid-cols-[1.15fr_1fr]">
          <Reveal>
            <h2 id="impact-h" className="text-3xl font-semibold tracking-tight md:text-[2.5rem]">{t.text("home.impact.heading")}</h2>
            <span className="mt-4 block h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
            <p className="mt-4 text-navy/70">{t.text("home.impact.sub")}</p>
            <ul className="mt-8 grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <li key={n} className="rounded-2xl border border-navy/10 bg-white p-5 shadow-sm">
                  <p className="font-display text-2xl font-semibold leading-tight text-royal">{t.text(`home.stat${n}.value`)}</p>
                  <p className="mt-1 text-xs leading-5 text-navy/65">{t.text(`home.stat${n}.label`)}</p>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120} className="aspect-[3/2] overflow-hidden rounded-3xl shadow-2xl shadow-navy/20">
            <SiteImage path={t.image("home.impact.image") || undefined} alt={t.imageAlt("home.impact.image")} icon="school" />
          </Reveal>
        </div>
      </section>

      {/* Meet our tutors */}
      {tutors.length > 0 ? (
        <section className="bg-cream-deep" aria-labelledby="tutors-h">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <SectionHeading id="tutors-h" title={t.text("home.tutors.heading")} sub={t.text("home.tutors.sub")} />
            </Reveal>
            <ul className="mt-12 flex flex-wrap justify-center gap-6">
              {tutors.slice(0, 4).map((x, i) => (
                <Reveal as="li" key={x.id} delay={i * 90} className="w-full sm:w-[calc(50%-0.75rem)] lg:w-[calc(25%-1.125rem)]"><TutorCard tutor={x} whatsapp={t.whatsapp} heading="h3" /></Reveal>
              ))}
            </ul>
            <div className="mt-10 text-center">
              <Link href="/tutors" className="inline-flex items-center gap-2 rounded-full bg-royal-deep px-7 py-3.5 font-semibold text-cream transition-transform hover:scale-[1.03] hover:bg-navy">
                {t.text("home.tutors.button")} <SiteIcon name="arrow" className="h-4 w-4" stroke={2.2} />
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <FeaturedResources items={resources} heading={t.text("home.resources.heading")} body={t.text("home.resources.body")} />

      {/* How it works */}
      <section className="bg-cream-deep">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Reveal><SectionHeading title={t.text("home.how.heading")} /></Reveal>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <Reveal as="li" key={n} delay={n * 110} className="relative rounded-3xl bg-white p-8 shadow-sm">
                <span className="absolute -top-5 left-8 grid h-11 w-11 place-items-center rounded-full bg-gold font-display text-xl font-bold text-navy shadow-lg">{n}</span>
                <h3 className="mt-3 text-lg font-semibold">{t.text(`home.how${n}.title`)}</h3>
                <p className="mt-2 leading-7 text-navy/75">{t.text(`home.how${n}.body`)}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Testimonials (hidden until the administrator adds real ones) */}
      {testimonials.length > 0 ? (
        <section className="mx-auto max-w-6xl px-6 py-20" aria-labelledby="testimonials-h">
          <Reveal>
            <SectionHeading id="testimonials-h" title={t.text("home.testimonials.heading")} sub={t.text("home.testimonials.sub")} />
          </Reveal>
          <div className={`mt-12 grid items-center gap-8 ${t.image("home.testimonials.image") ? "md:grid-cols-[1fr_1.1fr]" : "mx-auto max-w-3xl"}`}>
            {t.image("home.testimonials.image") ? (
              <Reveal className="aspect-[5/4] overflow-hidden rounded-3xl shadow-2xl shadow-navy/20">
                <SiteImage path={t.image("home.testimonials.image")} alt={t.imageAlt("home.testimonials.image")} icon="award" />
              </Reveal>
            ) : null}
            <Reveal delay={120}><Testimonials items={testimonials} /></Reveal>
          </div>
        </section>
      ) : null}

      {/* Fees */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-4">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight">{t.text("home.fees.heading")}</h2>
            <span className="mt-4 block h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
            <p className="mt-4 leading-7 text-navy/80">{t.text("home.fees.body")}</p>
            {PRICING_PAGE_ENABLED ? (
              <Link href="/pricing" className="mt-5 inline-block font-semibold text-royal underline decoration-gold decoration-2 underline-offset-4">
                See how our fees work
              </Link>
            ) : null}
          </Reveal>
          <Reveal delay={120} className="mesh relative overflow-hidden rounded-3xl p-8 text-cream shadow-2xl shadow-navy/25">
            <div className="blob -right-10 -top-10 h-40 w-40 bg-gold/40" aria-hidden="true" />
            <p className="relative text-xs font-bold uppercase tracking-[0.22em] text-gold">{t.text("home.talk.label")}</p>
            <p className="relative mt-3 text-xl leading-8">{t.text("home.talk.body")}</p>
            <p className="relative mt-4 text-sm">
              <a className="underline" href={`mailto:${biz.email}`}>{biz.email}</a> · {biz.phoneDisplay}
            </p>
          </Reveal>
        </div>
      </section>

      {/* Closing banner */}
      <section className="mx-auto max-w-6xl px-6 pb-4">
        <Reveal className="mesh relative isolate overflow-hidden rounded-[2rem] text-cream shadow-2xl shadow-navy/30">
          <div className="blob -left-10 top-0 h-56 w-56 bg-gold/40" aria-hidden="true" />
          <div className={`relative grid items-center gap-8 px-8 py-12 md:px-12 ${t.image("home.cta.image") ? "md:grid-cols-[0.8fr_1.2fr_auto] md:py-0" : "md:grid-cols-[auto_1fr_auto]"}`}>
            {t.image("home.cta.image") ? (
              <div className="relative -mb-12 hidden h-72 overflow-hidden rounded-2xl md:-mb-0 md:block md:h-full md:min-h-[17rem] md:rounded-none md:[mask-image:linear-gradient(to_right,#000_70%,transparent)]">
                <SiteImage path={t.image("home.cta.image")} alt={t.imageAlt("home.cta.image")} icon="cap" rounded="rounded-none" />
              </div>
            ) : (
              <span aria-hidden="true" className="grid h-20 w-20 place-items-center rounded-full border-2 border-gold/70 text-gold"><SiteIcon name="cap" className="h-10 w-10" stroke={1.4} /></span>
            )}
            <div className="md:py-12">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{t.text("home.cta.heading")}</h2>
              <p className="mt-3 max-w-xl text-cream/85">{t.text("home.cta.body")}</p>
            </div>
            <div className="md:py-12 md:pr-0">
              <a
                href={t.whatsapp(`Hello ${biz.name}, I would like help finding a tutor.`)}
                className="pulse-ring inline-flex items-center gap-2 rounded-full bg-gold px-8 py-4 font-semibold text-navy shadow-lg transition-transform hover:scale-[1.04] hover:bg-[#ffd04a]"
              >
                {t.text("home.cta.button")} <SiteIcon name="arrow" className="h-4 w-4" stroke={2.2} />
              </a>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
