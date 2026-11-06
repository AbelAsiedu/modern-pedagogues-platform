import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms/ActionForm";
import { ProductCover } from "@/components/site/ProductCard";
import { getActor } from "@/server/context";
import { db } from "@/server/db";
import { getPublicProduct, priceText } from "@/server/shop/service";
import { buyAction } from "../actions";

type Props = { params: Promise<{ slug: string }> };

const load = async (slug: string) => getPublicProduct(db(), slug).catch(() => null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load((await params).slug);
  return p ? { title: p.title, description: p.summary } : { title: "Resource not found" };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) notFound();
  const actor = await getActor();
  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <Link href="/shop" className="text-sm underline">← All resources</Link>
      <div className="mt-6 grid gap-10 md:grid-cols-2">
        <ProductCover path={p.coverPath} alt={p.title} className="h-72" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{p.title}</h1>
          <p className="mt-3 text-navy/80">{p.summary}</p>
          <p className="mt-6 text-3xl font-semibold">{priceText(p)}</p>
          <p className="mt-1 text-sm text-navy/70">PDF download. Paid by Mobile Money and confirmed by our team.</p>
          <div className="mt-6">
            {actor ? (
              <ActionForm action={buyAction} hidden={{ slug: p.slug }} fields={[]} submitLabel="Order this resource" />
            ) : (
              <p className="text-sm">
                <Link href={`/login?next=${encodeURIComponent(`/shop/${p.slug}`)}`} className="font-semibold underline decoration-gold underline-offset-4">Sign in</Link> or{" "}
                <Link href="/register" className="font-semibold underline decoration-gold underline-offset-4">create an account</Link> to order.
              </p>
            )}
          </div>
        </div>
      </div>
      {p.description ? <p className="mt-10 max-w-3xl whitespace-pre-line leading-7">{p.description}</p> : null}
    </div>
  );
}
