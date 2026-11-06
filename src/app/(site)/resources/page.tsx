import Link from "next/link";
import { seoMetadata } from "@/server/seo";
import { Hero } from "@/components/site/Chrome";
import { ProductCard } from "@/components/site/ProductCard";
import { getSiteText } from "@/server/context";
import { db } from "@/server/db";
import { KIND_LABELS, RESOURCE_KINDS } from "@/server/resources/quality";
import { resourceTaxonomy } from "@/server/resources/taxonomy";
import { listPublicProducts, type PublicProduct, type ResourceFilter } from "@/server/shop/service";

export const generateMetadata = () => seoMetadata("resources");
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function Resources({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filter: ResourceFilter = { q: one(sp.q), kind: one(sp.kind), level: one(sp.level), price: one(sp.price) };
  const t = await getSiteText();
  let items: PublicProduct[] = [];
  let levels: { key: string; name: string }[] = [];
  let unavailable = false;
  try {
    [items, { levels }] = await Promise.all([listPublicProducts(db(), filter), resourceTaxonomy(db())]);
  } catch {
    unavailable = true;
  }
  const filtered = Object.values(filter).some(Boolean);
  const sel = "mt-1 w-full rounded-xl border border-navy/25 bg-white px-3 py-2 text-sm";
  return (
    <>
      <Hero kicker="Resources" title={t.text("shop.hero.title")} imageKey="page.resources.image" icon="book">
        <p>{t.text("shop.hero.intro")}</p>
        <p className="mt-4 flex flex-wrap gap-4 text-base">
          <Link href="/creator/join" className="rounded-full bg-gold px-5 py-2 font-semibold text-navy hover:opacity-90">Share your own resource</Link>
          <Link href="/resources/standards" className="self-center underline decoration-gold underline-offset-4">Our quality standard</Link>
        </p>
      </Hero>
      <div className="mx-auto max-w-6xl px-6 py-12">
        <form method="get" className="grid gap-4 rounded-3xl border border-navy/10 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5" aria-label="Filter resources">
          <label className="text-sm font-medium">
            Search
            <input name="q" defaultValue={filter.q} placeholder="e.g. fractions" maxLength={80} className={sel} />
          </label>
          <label className="text-sm font-medium">
            Type
            <select name="kind" defaultValue={filter.kind} className={sel}>
              <option value="">Any type</option>
              {RESOURCE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">
            Level
            <select name="level" defaultValue={filter.level} className={sel}>
              <option value="">Any level</option>
              {levels.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">
            Price
            <select name="price" defaultValue={filter.price} className={sel}>
              <option value="">Free and paid</option>
              <option value="free">Free only</option>
              <option value="paid">Paid only</option>
            </select>
          </label>
          <div className="flex items-end gap-3">
            <button className="rounded-full bg-navy px-5 py-2 text-sm font-semibold text-cream">Search</button>
            {filtered ? <Link href="/resources" className="text-sm underline">Clear</Link> : null}
          </div>
        </form>

        {unavailable ? (
          <p className="mt-10 rounded-lg bg-amber-100 p-4 text-amber-900" role="status">The resources are temporarily unavailable. Please try again shortly, or message us on WhatsApp.</p>
        ) : items.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-navy/10 bg-white p-8 shadow-sm" role="status">
            <p>{filtered ? "No resources match those choices. Try clearing the filters." : t.text("shop.empty")}</p>
            <a href={t.whatsapp(`Hello ${t.biz.name}, I am looking for a learning resource.`)} className="mt-4 inline-block font-semibold underline decoration-gold underline-offset-4">Ask on WhatsApp</a>
          </div>
        ) : (
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-label="Resources">
            {items.map((p) => <li key={p.id}><ProductCard product={p} /></li>)}
          </ul>
        )}
      </div>
    </>
  );
}
