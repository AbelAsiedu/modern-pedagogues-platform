import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms/ActionForm";
import { ProductCover } from "@/components/site/ProductCard";
import { getActor } from "@/server/context";
import { db } from "@/server/db";
import { KIND_LABELS } from "@/server/resources/quality";
import { getMyOrderForProduct, getPublicProduct, isFree, priceText } from "@/server/shop/service";
import { buyAction } from "../actions";

type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";

const load = async (slug: string) => getPublicProduct(db(), slug).catch(() => null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load((await params).slug);
  return p ? { title: p.title, description: p.summary } : { title: "Resource not found" };
}

const btn = "inline-block rounded-full bg-royal px-6 py-3 font-semibold text-cream shadow hover:bg-royal-deep";

export default async function ResourcePage({ params }: Props) {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) notFound();
  const actor = await getActor();
  const here = `/resources/${p.slug}`;
  const order = isFree(p) ? null : await getMyOrderForProduct(db(), actor, p.id).catch(() => null);
  const signIn = (
    <p className="text-sm">
      <Link href={`/login?next=${encodeURIComponent(here)}`} className="font-semibold underline decoration-gold underline-offset-4">Sign in</Link> or{" "}
      <Link href="/register" className="font-semibold underline decoration-gold underline-offset-4">create an account</Link>{" "}
      {isFree(p) ? "to download it free." : "to order."}
    </p>
  );
  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <Link href="/resources" className="text-sm underline">← All resources</Link>
      <div className="mt-6 grid gap-10 md:grid-cols-2">
        <ProductCover path={p.coverPath} alt={p.title} className="h-72" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-navy/70">{KIND_LABELS[p.kind]}{p.subject ? ` · ${p.subject}` : ""}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{p.title}</h1>
          <p className="mt-1 text-sm text-navy/70">by {p.authorName}{p.pageCount ? ` · ${p.pageCount} pages` : ""} · {p.language} · PDF</p>
          <p className="mt-3 text-navy/80">{p.summary}</p>
          <p className={`mt-6 text-3xl font-semibold ${isFree(p) ? "text-green-800" : ""}`}>{priceText(p)}</p>

          <div className="mt-5">
            {!actor ? (
              signIn
            ) : isFree(p) ? (
              <>
                <a href={`/api/resources/${p.slug}/download`} className={btn}>Download PDF (free)</a>
              </>
            ) : order?.status === "PAID" ? (
              <>
                <p className="text-sm text-green-800">You have bought this resource.</p>
                <Link href="/account/orders" className={`${btn} mt-3`}>Go to my downloads</Link>
              </>
            ) : order?.status === "PENDING_PAYMENT" ? (
              <>
                <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-900">Your order <strong>{order.reference}</strong> is waiting for payment. The PDF stays locked until our team confirms it.</p>
                <Link href="/account/orders" className="mt-3 inline-block font-semibold underline decoration-gold underline-offset-4">See how to pay</Link>
              </>
            ) : (
              <>
                <p className="mb-3 text-sm text-navy/70">Locked until paid. Pay by Mobile Money; our team confirms it and your download unlocks.</p>
                <ActionForm action={buyAction} hidden={{ slug: p.slug }} fields={[]} submitLabel="Order this resource" />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-12 grid gap-10 md:grid-cols-3">
        <div className="md:col-span-2">
          {p.description ? (<><h2 className="text-xl font-semibold">About this resource</h2><p className="mt-3 whitespace-pre-line leading-7">{p.description}</p></>) : null}
          {p.outcomes.length > 0 ? (
            <>
              <h2 className="mt-10 text-xl font-semibold">What you will be able to do</h2>
              <ul className="mt-3 list-disc space-y-1 pl-6 leading-7">{p.outcomes.map((o) => <li key={o}>{o}</li>)}</ul>
            </>
          ) : null}
          {p.tableOfContents ? (
            <>
              <h2 className="mt-10 text-xl font-semibold">Contents</h2>
              <p className="mt-3 whitespace-pre-line leading-7">{p.tableOfContents}</p>
            </>
          ) : null}
        </div>
        <aside className="h-fit rounded-2xl border border-navy/10 bg-white/70 p-5 text-sm leading-6">
          {p.audience ? (<><h2 className="font-semibold">Who it is for</h2><p className="mt-1">{p.audience}</p></>) : null}
          <h2 className="mt-4 font-semibold">Quality checked</h2>
          <p className="mt-1">A TMP reviewer scored this against our <Link href="/resources/standards" className="underline decoration-gold underline-offset-4">published standard</Link> before it was listed.</p>
        </aside>
      </div>
    </div>
  );
}
