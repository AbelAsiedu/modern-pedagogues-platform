import type { Metadata } from "next";
import { Hero, Prose } from "@/components/site/Chrome";
import { RichText } from "@/components/site/RichText";
import { getSiteText } from "@/server/context";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What personal information The Modern Pedagogues collects, why, and your choices.",
};

export default async function Privacy() {
  const t = await getSiteText();
  return (
    <>
      <Hero kicker="Policy" title="Privacy policy" />
      <Prose>
        <RichText text={t.text("legal.privacy")} />
      </Prose>
    </>
  );
}
