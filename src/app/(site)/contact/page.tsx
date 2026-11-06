import { seoMetadata } from "@/server/seo";
import { Hero } from "@/components/site/Chrome";
import { getSiteText } from "@/server/context";

export const generateMetadata = () => seoMetadata("contact");

export default async function Contact() {
  const t = await getSiteText();
  const b = t.biz;
  return (
    <>
      <Hero kicker="Contact" title={t.text("contact.hero.title")}>
        <p>{t.text("contact.hero.intro")}</p>
      </Hero>
      <div className="mx-auto max-w-3xl px-6 py-16">
        <dl className="space-y-6">
          <div>
            <dt className="text-sm font-semibold uppercase tracking-widest text-gold">Email</dt>
            <dd className="mt-1 text-xl"><a href={`mailto:${b.email}`}>{b.email}</a></dd>
          </div>
          <div>
            <dt className="text-sm font-semibold uppercase tracking-widest text-gold">Phone and WhatsApp</dt>
            <dd className="mt-1 text-xl"><a href={`tel:${b.phoneTel}`}>{b.phoneDisplay}</a></dd>
          </div>
          <div>
            <dt className="text-sm font-semibold uppercase tracking-widest text-gold">{b.momoNetwork} (MoMo) number</dt>
            <dd className="mt-1 text-xl">{b.momoNumber}</dd>
            <dd className="mt-1 text-sm">{t.text("contact.momo.note")}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold uppercase tracking-widest text-gold">Where we work</dt>
            <dd className="mt-1">{t.text("contact.where")}</dd>
          </div>
        </dl>
        <a
          href={t.whatsapp(`Hello ${b.name}, I would like to get in touch.`)}
          className="mt-10 inline-block rounded-full bg-navy px-6 py-3 font-semibold text-cream"
        >
          Chat with TMP on WhatsApp
        </a>
      </div>
    </>
  );
}
