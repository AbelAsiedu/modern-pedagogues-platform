import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/site/AuthCard";
import { ActionForm } from "@/components/forms/ActionForm";
import { resendVerificationAction } from "../auth-actions";

export const metadata: Metadata = { title: "Send the confirmation email again", robots: { index: false } };

export default function ResendVerificationPage() {
  return (
    <AuthCard
      title="Send the confirmation email again"
      intro="Enter the email you registered with and we will send a fresh link to confirm it. Older links stop working."
      footer={<p><Link href="/login" className="underline">Back to sign in</Link></p>}
    >
      <ActionForm
        action={resendVerificationAction}
        submitLabel="Send a new link"
        fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email", required: true }]}
      />
    </AuthCard>
  );
}
