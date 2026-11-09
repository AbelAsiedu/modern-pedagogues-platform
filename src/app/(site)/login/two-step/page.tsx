import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/site/AuthCard";
import { ActionForm } from "@/components/forms/ActionForm";
import { getMfaChallengeCookie, getSession, safeNext } from "@/server/context";
import { twoStepLoginAction } from "../../auth-actions";

export const metadata: Metadata = { title: "Two-step sign-in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function TwoStepPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (await getSession()) redirect(safeNext(sp.next));
  // Without the ticket from the password step there is nothing to finish.
  if (!(await getMfaChallengeCookie())) redirect("/login");
  return (
    <AuthCard
      title="Two-step sign-in"
      intro="Open your authenticator app and type the 6-digit code it shows for The Modern Pedagogues."
      footer={
        <p>
          Lost your phone? Type one of your recovery codes instead. <Link href="/login" className="underline">Start again</Link>
        </p>
      }
    >
      <ActionForm
        action={twoStepLoginAction}
        submitLabel="Sign in"
        hidden={{ next: sp.next ?? "" }}
        fields={[
          {
            name: "code",
            label: "Code",
            type: "text",
            autoComplete: "one-time-code",
            required: true,
            hint: "6 digits from the app, or a recovery code like ABCDE-FGHJK. The code expires and changes every 30 seconds.",
          },
        ]}
      />
    </AuthCard>
  );
}
