import { seoMetadata } from "@/server/seo";
import { SiteIcon } from "@/components/site/Brand";
import { Hero } from "@/components/site/Chrome";
import { Reveal } from "@/components/site/Reveal";
import { getSiteText } from "@/server/context";

export const generateMetadata = () => seoMetadata("contact");

export default async function Contact() {
  const t = await getSiteText();
  const b = t.biz;
  return (
    <>
      <Hero kicker="Contact" title={t.text("contact.hero.title")} imageKey="page.contact.image" icon="phone">
        <p>{t.text("contact.hero.intro")}</p>
      </Hero>
      <div className="mx-auto max-w-5xl px-6 pb-20 pt-6">
        <dl className="grid gap-5 sm:grid-cols-2">
          {[
            { icon: "mail" as const, label: "Email", body: <a className="text-royal underline decoration-gold decoration-2 underline-offset-4" href={`mailto:${b.email}`}>{b.email}</a> },
            { icon: "phone" as const, label: "Phone and WhatsApp", body: <a className="text-royal underline decoration-gold decoration-2 underline-offset-4" href={`tel:${b.phoneTel}`}>{b.phoneDisplay}</a> },
            { icon: "award" as const, label: `${b.momoNetwork} (MoMo) number`, body: <><span>{b.momoNumber}</span><span className="mt-1 block text-sm font-normal text-navy/70">{t.text("contact.momo.note")}</span></> },
            { icon: "school" as const, label: "Where we work", body: <span className="text-base font-normal">{t.text("contact.where")}</span> },
          ].map((c) => (
            <Reveal key={c.label} className="lift rounded-3xl border border-navy/10 bg-white p-7 shadow-sm">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-cream-deep text-royal"><SiteIcon name={c.icon} className="h-6 w-6" /></span>
              <dt className="mt-4 text-xs font-bold uppercase tracking-widest text-gold-ink">{c.label}</dt>
              <dd className="mt-1 text-xl font-semibold">{c.body}</dd>
            </Reveal>
          ))}
        </dl>
        <a
          href={t.whatsapp(`Hello ${b.name}, I would like to get in touch.`)}
          className="pulse-ring mt-10 inline-flex items-center gap-2 rounded-full bg-gold px-8 py-4 font-semibold text-navy shadow-lg transition-transform hover:scale-[1.03]"
        >
          Chat with TMP on WhatsApp <SiteIcon name="arrow" className="h-4 w-4" stroke={2.2} />
        </a>
      </div>
    </>
  );
}
