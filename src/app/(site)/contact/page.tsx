import type { Metadata } from "next";
import { Hero } from "@/components/site/Chrome";
import { SITE, whatsappLink } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact The Modern Pedagogues by email, phone or WhatsApp.",
};

export default function Contact() {
  return (
    <>
      <Hero kicker="Contact" title="Let's make the next stage clearer">
        <p>Tell us about your ward, school and goals.</p>
      </Hero>
      <div className="mx-auto max-w-3xl px-6 py-16">
        <dl className="space-y-6">
          <div>
            <dt className="text-sm font-semibold uppercase tracking-widest text-gold">Email</dt>
            <dd className="mt-1 text-xl"><a href={`mailto:${SITE.email}`}>{SITE.email}</a></dd>
          </div>
          <div>
            <dt className="text-sm font-semibold uppercase tracking-widest text-gold">Phone and WhatsApp</dt>
            <dd className="mt-1 text-xl"><a href={`tel:${SITE.phoneTel}`}>{SITE.phoneDisplay}</a></dd>
          </div>
          <div>
            <dt className="text-sm font-semibold uppercase tracking-widest text-gold">Where we work</dt>
            <dd className="mt-1">Ghana (home tuition) and online for learners anywhere.</dd>
          </div>
        </dl>
        <a
          href={whatsappLink("Hello TMP, I would like to get in touch.")}
          className="mt-10 inline-block rounded-full bg-navy px-6 py-3 font-semibold text-cream"
        >
          Chat with TMP on WhatsApp
        </a>
      </div>
    </>
  );
}
