import type { Metadata } from "next";
import Link from "next/link";
import { Hero, Prose } from "@/components/site/Chrome";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms for using The Modern Pedagogues website and services.",
};

export default function Terms() {
  return (
    <>
      <Hero kicker="Policy" title="Terms of service" />
      <Prose>
        <p>Last updated 4 November 2026. By using this website or our services you agree to these terms.</p>

        <h2>1. Who we are</h2>
        <p>
          {SITE.name} (&quot;TMP&quot;, &quot;we&quot;) provides tutoring, exam preparation and educational consulting in {SITE.country} and online.
          Contact: <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
        </p>

        <h2>2. Our services</h2>
        <p>
          We match learners with qualified tutors and run programmes as described on this website. We aim for good progress
          but cannot guarantee particular exam results or grades, which also depend on the learner&apos;s effort and many
          other factors.
        </p>

        <h2>3. Fees and payment</h2>
        <p>
          Tutoring fees are agreed with you before the first session and are quoted in Ghana cedis (GH₵). See{" "}
          <Link href="/pricing">Pricing</Link>. Cancellations and refunds are covered in our{" "}
          <Link href="/refunds">refund and cancellation policy</Link>.
        </p>

        <h2>4. Parents, guardians and learners</h2>
        <p>
          If the learner is under 18, a parent or guardian must agree to these terms and arrange payment. Please give us
          accurate information about the learner and tell us about anything that affects their learning or safety.
        </p>

        <h2>5. Conduct</h2>
        <p>
          Everyone involved, including learners, parents and tutors, is expected to behave respectfully. We may end
          tutoring arrangements where conduct puts anyone&apos;s safety or wellbeing at risk. Lesson materials remain TMP&apos;s
          or its tutors&apos; property and may not be copied or resold without permission.
        </p>

        <h2>6. Website use</h2>
        <p>
          Do not misuse this website, attempt to disrupt it or access it in unauthorised ways. We try to keep it available
          and accurate, but provide it as is and may change or withdraw content at any time.
        </p>

        <h2>7. Liability</h2>
        <p>
          Nothing limits liability that cannot lawfully be limited. Subject to that, TMP is not liable for indirect or
          consequential loss arising from use of the website or services.
        </p>

        <h2>8. Privacy</h2>
        <p>
          How we handle personal information is explained in our <Link href="/privacy">privacy policy</Link>.
        </p>

        <h2>9. Changes and governing law</h2>
        <p>
          We may update these terms; the date above shows the latest version. These terms are governed by the laws of
          Ghana.
        </p>

        <h2>10. Contact</h2>
        <p>Questions about these terms: <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.</p>
      </Prose>
    </>
  );
}
