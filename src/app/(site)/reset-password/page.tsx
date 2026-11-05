import type { Metadata } from "next";
import { AuthCard } from "@/components/site/AuthCard";
import { ActionForm } from "@/components/forms/ActionForm";
import { resetPasswordAction } from "../auth-actions";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Choose a new password">
      {token ? (
        <ActionForm
          action={resetPasswordAction}
          submitLabel="Save password"
          hidden={{ token }}
          fields={[{ name: "password", label: "New password", type: "password", autoComplete: "new-password", required: true, hint: "At least 12 characters." }]}
        />
      ) : (
        <p>This link is missing its code. Request a new reset link from the sign-in page.</p>
      )}
    </AuthCard>
  );
}
