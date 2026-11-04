import type { Metadata } from "next";
import { Hero, Prose } from "@/components/site/Chrome";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What personal information The Modern Pedagogues collects, why, and your choices.",
};

export default function Privacy() {
  return (
    <>
      <Hero kicker="Policy" title="Privacy policy" />
      <Prose>
        <p>Last updated 4 November 2026.</p>

        <h2>Who is responsible</h2>
        <p>
          {SITE.name} is responsible for the personal information described here. We handle it with regard to
          Ghana&apos;s Data Protection Act, 2012 (Act 843). Contact: <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>When you contact us</strong> by email, phone or WhatsApp: your name, contact details and what you tell
            us about the learner (for example level, subjects and schedule).
          </li>
          <li>
            <strong>When you become a client</strong>: the learner&apos;s name, age or level, school, learning needs, session
            records and progress reports, and payment records.
          </li>
          <li>
            <strong>Payments</strong> are handled by our payment provider, Paystack. We receive confirmation and a payment
            reference. We do not see or store your card number or Mobile Money PIN.
          </li>
        </ul>
        <p>This website does not currently use advertising or analytics cookies.</p>

        <h2>Why we use it</h2>
        <ul>
          <li>To reply to you, arrange and deliver tutoring, and report on progress.</li>
          <li>To take payment, keep financial records and meet legal obligations.</li>
          <li>To keep our services safe and to improve them.</li>
        </ul>

        <h2>Who we share it with</h2>
        <p>
          With the tutor assigned to your ward (only what they need to teach); with service providers who help us run the
          service, such as payment processing, hosting and email; and where the law requires. We do not sell personal
          information.
        </p>

        <h2>Children</h2>
        <p>
          Most learners are children. We collect information about them from their parent or guardian, and use it only to
          provide and manage their learning.
        </p>

        <h2>Keeping it safe</h2>
        <p>
          We use access controls, encrypted connections and hashed passwords, and limit who can see learner information. No
          system is perfectly secure, so please tell us at once if you suspect a problem.
        </p>

        <h2>How long we keep it</h2>
        <p>
          We keep information for as long as we provide services to you and as needed for our records and legal duties, then
          delete or anonymise it.
        </p>

        <h2>Your choices</h2>
        <p>
          You can ask to see, correct or delete the information we hold about you or your ward, or object to how we use it, by
          emailing <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
        </p>

        <h2>Changes</h2>
        <p>We will update this page and its date if our practices change.</p>
      </Prose>
    </>
  );
}
