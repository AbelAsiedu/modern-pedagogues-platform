import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, Notice } from "@/components/site/AuthCard";
import { ActionForm } from "@/components/forms/ActionForm";
import { getSession, safeNext } from "@/server/context";
import { loginAction } from "../auth-actions";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (await getSession()) redirect(safeNext(sp.next));
  return (
    <AuthCard
      title="Sign in"
      footer={
        <p>
          <Link href="/forgot-password" className="underline">Forgot your password?</Link> · <Link href="/register" className="underline">Create an account</Link>
        </p>
      }
    >
      {sp.verified ? <Notice>Email confirmed. You can sign in now.</Notice> : null}
      {sp.reset ? <Notice>Password updated. Sign in with your new password.</Notice> : null}
      <ActionForm
        action={loginAction}
        submitLabel="Sign in"
        hidden={{ next: sp.next ?? "" }}
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email", required: true },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password", required: true },
        ]}
      />
    </AuthCard>
  );
}
