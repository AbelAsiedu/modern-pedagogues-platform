import Link from "next/link";
import { KIND_LABELS } from "@/server/resources/quality";
import { isFree, priceText, type PublicProduct } from "@/server/shop/service";

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
  const href = `/resources/${product.slug}`;
  return (
    <article className="lift glass flex h-full flex-col rounded-3xl p-5">
      <Link href={href} aria-label={product.title}>
        <ProductCover path={product.coverPath} />
      </Link>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-navy/70">
        {KIND_LABELS[product.kind]}{product.subject ? ` · ${product.subject}` : ""}
      </p>
      <h2 className="mt-1 text-lg font-semibold leading-tight">
        <Link href={href} className="hover:text-gold">{product.title}</Link>
      </h2>
      <p className="mt-1 text-sm text-navy/70">by {product.authorName}{product.pageCount ? ` · ${product.pageCount} pages` : ""}</p>
      <p className="mt-2 flex-1 text-sm leading-6 text-navy/80">{product.summary}</p>
      <div className="mt-4 flex items-center justify-between">
        <p className={`text-lg font-semibold ${isFree(product) ? "text-green-800" : ""}`}>{priceText(product)}</p>
        <Link href={href} className="text-sm font-semibold underline decoration-gold underline-offset-4">View</Link>
      </div>
    </article>
  );
}
