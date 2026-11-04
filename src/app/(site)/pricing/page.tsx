import type { Metadata } from "next";
import { Hero } from "@/components/site/Chrome";
import { format } from "@/lib/money";
import { INDICATIVE_TUTORING_RATE, SITE, whatsappLink } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Tutoring fees are agreed per learner and start from GH₵ 100 per session.",
};

export default function Pricing() {
  return (
    <>
      <Hero kicker="Pricing" title="Fair fees, agreed up front">
        <p>No hidden charges. You know the rate before the first lesson.</p>
      </Hero>
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-2xl border-2 border-gold bg-white/60 p-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold">Tutoring</p>
          <p className="mt-2 text-4xl font-semibold">
            From {format(INDICATIVE_TUTORING_RATE)} <span className="text-lg font-normal">per session</span>
          </p>
          <p className="mt-3">
            Rates are negotiable and depend on the learner&apos;s level, subjects, curriculum, location (home or online) and
            how often sessions run.
          </p>
        </div>

        <h2 className="mt-12 text-2xl font-semibold">How it works</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-6">
          <li>Tell us about your ward: level, subjects, curriculum, goals and schedule.</li>
          <li>We recommend a tutor and programme, and propose a rate per session.</li>
          <li>You and TMP agree the rate and schedule before the first lesson.</li>
          <li>Payment is made as agreed; you receive confirmation of each payment.</li>
        </ol>

        <h2 className="mt-12 text-2xl font-semibold">Paying</h2>
        <p className="mt-3">
          All fees are in Ghana cedis (GH₵). You can pay by {SITE.momoNetwork} to our MoMo number, {SITE.phoneDisplay}.
          Please confirm the payment details with us on WhatsApp before you send money, and keep your payment confirmation.
          Online payment through Paystack, including MTN Mobile Money and cards, is being set up; TMP never sees or stores
          your card number or Mobile Money PIN.
        </p>

        <h2 className="mt-12 text-2xl font-semibold">Other programmes</h2>
        <p className="mt-3">
          Group programmes such as Final Lap and Pre-SHS Launchpad, and consulting for schools, are priced per engagement.
          Ask us for a quote.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <a href={whatsappLink("Hello TMP, I would like a quote for tutoring.")} className="rounded-full bg-navy px-6 py-3 font-semibold text-cream">
            Ask for a quote on WhatsApp
          </a>
          <a href={`mailto:${SITE.email}?subject=Tutoring%20quote`} className="rounded-full border border-navy px-6 py-3 font-semibold">
            Email us
          </a>
        </div>
      </div>
    </>
  );
}
