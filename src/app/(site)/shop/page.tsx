import type { Metadata } from "next";
import { Hero } from "@/components/site/Chrome";
import { ProductCard } from "@/components/site/ProductCard";
import { whatsappLink } from "@/lib/site";
import { getSiteText } from "@/server/context";
import { db } from "@/server/db";
import { listPublicProducts, type PublicProduct } from "@/server/shop/service";

export const metadata: Metadata = {
  title: "Shop",
  description: "Worksheets, past questions and revision notes from The Modern Pedagogues. Pay by Mobile Money and download.",
};

export default async function Shop() {
  const t = await getSiteText();
  let items: PublicProduct[] = [];
  let unavailable = false;
  try {
    items = await listPublicProducts(db());
  } catch {
    unavailable = true;
  }
  return (
    <>
      <Hero kicker="Shop" title={t.text("shop.hero.title")}>
        <p>{t.text("shop.hero.intro")}</p>
      </Hero>
      <div className="mx-auto max-w-6xl px-6 py-12">
        {unavailable ? (
          <p className="rounded-lg bg-amber-100 p-4 text-amber-900">The shop is temporarily unavailable. Please try again shortly, or message us on WhatsApp.</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-navy/10 bg-white/70 p-8">
            <p>{t.text("shop.empty")}</p>
            <a href={whatsappLink("Hello TMP, I am looking for a learning resource.")} className="mt-4 inline-block font-semibold underline decoration-gold underline-offset-4">Ask on WhatsApp</a>
          </div>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => <li key={p.id}><ProductCard product={p} /></li>)}
          </ul>
        )}
      </div>
    </>
  );
}
