import type { Metadata } from "next";
import { Hero, Prose } from "@/components/site/Chrome";
import { RichText } from "@/components/site/RichText";
import { getSiteText } from "@/server/context";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms for using The Modern Pedagogues website and services.",
};

export default async function Terms() {
  const t = await getSiteText();
  return (
    <>
      <Hero kicker="Policy" title="Terms of service" />
      <Prose>
        <RichText text={t.text("legal.terms")} />
      </Prose>
    </>
  );
}
