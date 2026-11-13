import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, Notice } from "@/components/site/AuthCard";
import { ActionForm } from "@/components/forms/ActionForm";
import { GoogleButton, OrDivider } from "@/components/site/GoogleButton";
import { getSession, googleConfig, safeNext } from "@/server/context";
import { loginAction } from "../auth-actions";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (await getSession()) redirect(safeNext(sp.next));
  const google = googleConfig() !== null;
  return (
    <AuthCard
      title="Sign in"
      footer={
        <>
        <p>
          <Link href="/forgot-password" className="underline">Forgot your password?</Link> · <Link href="/register" className="underline">Create an account</Link>
        </p>
        <p className="mt-2">
          Did not get the confirmation email, or the link did not work? <Link href="/resend-verification" className="underline">Send it again</Link>
        </p>
        </>
      }
    >
      {sp.verified ? <Notice>Email confirmed. You can sign in now.</Notice> : null}
      {sp.expired ? <Notice tone="warn">Your sign-in took too long or was interrupted. Please start again.</Notice> : null}
      {sp.reset ? <Notice>Password updated. Sign in with your new password.</Notice> : null}
      {sp.google ? <GoogleNotice reason={sp.google} /> : null}
      {google ? (
        <>
          <GoogleButton label="Continue with Google" next={sp.next} />
          <OrDivider />
        </>
      ) : null}
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

const GOOGLE_MESSAGES: Record<string, string> = {
  denied: "Google sign-in was cancelled. You can try again or use your email and password.",
  unverified: "Google says that email address is not verified, so we cannot use it. Use your email and password instead.",
  suspended: "This account is suspended. Please contact us.",
  conflict: "This account is already linked to a different Google account. Sign in with that one, or use your email and password.",
  busy: "Too many sign-in attempts. Please wait a few minutes and try again.",
  expired: "Your Google sign-in took too long or was interrupted. Please start again.",
  unavailable: "Sign in with Google is not switched on for this site.",
};

function GoogleNotice({ reason }: { reason: string }) {
  return <Notice tone="warn">{GOOGLE_MESSAGES[reason] ?? "We could not sign you in with Google. Please try again, or use your email and password."}</Notice>;
}
