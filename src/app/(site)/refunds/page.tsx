import type { Metadata } from "next";
import { Hero, Prose } from "@/components/site/Chrome";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Refunds and cancellations",
  description: "How cancellations, rescheduling and refunds work at The Modern Pedagogues.",
};

export default function Refunds() {
  return (
    <>
      <Hero kicker="Policy" title="Refunds and cancellations" />
      <Prose>
        <p>Last updated 4 November 2026.</p>

        <h2>Tutoring sessions</h2>
        <ul>
          <li>You can cancel or reschedule a session free of charge with at least 24 hours&apos; notice.</li>
          <li>Cancellations with less than 24 hours&apos; notice, or missed sessions, may be charged at the agreed session rate. We will consider genuine emergencies.</li>
          <li>If TMP or the tutor cancels a session, we will offer a replacement session at a time that suits you, or refund that session.</li>
          <li>If you are not satisfied with a tutor, tell us. We will work with you to resolve it or assign a different tutor.</li>
        </ul>

        <h2>Prepaid sessions and programmes</h2>
        <ul>
          <li>If you have paid for sessions or a programme that has not been delivered, you can ask for a refund of the undelivered part.</li>
          <li>Sessions or programme days already delivered are not refundable.</li>
          <li>Group programmes (for example Final Lap) may have their own terms, which we will tell you before you pay.</li>
        </ul>

        <h2>How to ask for a refund</h2>
        <p>
          Email <a href={`mailto:${SITE.email}`}>{SITE.email}</a> or message us on WhatsApp ({SITE.phoneDisplay}) with the
          name of the learner, the payment reference and the reason. We will reply with a decision. Approved refunds are
          returned to the original payment method (card or Mobile Money). The time it takes to reach you depends on your bank
          or Mobile Money provider.
        </p>

        <h2>Digital resources</h2>
        <p>
          Terms for digital resources and courses will be published here before they go on sale.
        </p>
      </Prose>
    </>
  );
}
