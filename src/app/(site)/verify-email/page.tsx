import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/site/AuthCard";
import { ActionForm } from "@/components/forms/ActionForm";
import { verifyEmailAction } from "../auth-actions";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

// A button, not an automatic GET: email scanners and link previews fetch URLs and would use up the token.
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Confirm your email">
      {token ? (
        <ActionForm action={verifyEmailAction} submitLabel="Confirm my email" hidden={{ token }} fields={[]} />
      ) : (
        <p>This link is missing its code. Open the link from your email again, or <Link href="/resend-verification" className="underline">ask for a new email</Link>.</p>
      )}
    </AuthCard>
  );
}
