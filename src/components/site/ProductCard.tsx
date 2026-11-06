import Link from "next/link";
import { priceText, type PublicProduct } from "@/server/shop/service";

export function ProductCover({ path, alt = "", className = "h-44" }: { path: string | null; alt?: string; className?: string }) {
  if (!path) {
    return (
      <div aria-hidden className={`grid w-full place-items-center rounded-xl bg-navy text-gold ${className}`}>
        <span className="text-4xl font-semibold">PDF</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={path} alt={alt} className={`w-full rounded-xl bg-cream-deep object-cover ${className}`} />;
}

export function ProductCard({ product }: { product: PublicProduct }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-navy/10 bg-white/70 p-5">
      <Link href={`/shop/${product.slug}`} aria-label={product.title}>
        <ProductCover path={product.coverPath} />
      </Link>
      <h2 className="mt-4 text-lg font-semibold leading-tight">
        <Link href={`/shop/${product.slug}`} className="hover:text-gold">{product.title}</Link>
      </h2>
      <p className="mt-2 flex-1 text-sm leading-6 text-navy/80">{product.summary}</p>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-lg font-semibold">{priceText(product)}</p>
        <Link href={`/shop/${product.slug}`} className="text-sm font-semibold underline decoration-gold underline-offset-4">View</Link>
      </div>
    </article>
  );
}
