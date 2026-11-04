import Link from "next/link";
import { PageShell } from "@/components/site/Chrome";

export default function NotFound() {
  return (
    <PageShell>
      <div className="mx-auto max-w-3xl px-6 py-24">
        <h1 className="text-3xl font-semibold">Page not found</h1>
        <p className="mt-3">We couldn&apos;t find that page.</p>
        <Link href="/" className="mt-6 inline-block font-semibold underline decoration-gold underline-offset-4">
          Back to the home page
        </Link>
      </div>
    </PageShell>
  );
}
