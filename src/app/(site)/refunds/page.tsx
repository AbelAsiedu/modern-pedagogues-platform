import type { Metadata } from "next";
import { Hero, Prose } from "@/components/site/Chrome";
import { RichText } from "@/components/site/RichText";
import { getSiteText } from "@/server/context";

export const metadata: Metadata = {
  title: "Refunds and cancellations",
  description: "How cancellations, rescheduling and refunds work at The Modern Pedagogues.",
};

export default async function Refunds() {
  const t = await getSiteText();
  return (
    <>
      <Hero kicker="Policy" title="Refunds and cancellations" />
      <Prose>
        <RichText text={t.text("legal.refunds")} />
      </Prose>
    </>
  );
}
