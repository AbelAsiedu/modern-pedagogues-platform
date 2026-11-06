import Link from "next/link";
import { Marquee } from "./Marquee";
import { ProductCard } from "./ProductCard";
import type { PublicProduct } from "@/server/shop/service";

/** A looping strip of resources. Repeats a short list so the loop always has enough cards to fill the width. */
export function FeaturedResources({ items, heading, body }: { items: PublicProduct[]; heading: string; body: string }) {
  if (items.length === 0) return null;
  const shown = items.slice(0, 10);
  const repeats = Math.max(1, Math.ceil(6 / shown.length));
  const cards = Array.from({ length: repeats }, () => shown).flat();
  return (
    <section className="py-20" aria-labelledby="featured-resources">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-6">
        <div>
          <h2 id="featured-resources" className="text-3xl font-semibold tracking-tight md:text-[2.5rem]">{heading}</h2>
          <span className="mt-4 block h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
          <p className="mt-4 max-w-xl text-navy/75">{body}</p>
        </div>
        <Link href="/resources" className="rounded-full bg-royal-deep px-6 py-3 text-sm font-semibold text-cream transition-transform hover:scale-[1.03] hover:bg-navy">
          Browse all resources →
        </Link>
      </div>
      <Marquee label="Featured resources" seconds={Math.max(30, cards.length * 7)} className="mt-10">
        {cards.map((p, i) => (
          <div key={`${p.id}-${i}`} className="w-72 shrink-0">
            <ProductCard product={p} />
          </div>
        ))}
      </Marquee>
    </section>
  );
}
