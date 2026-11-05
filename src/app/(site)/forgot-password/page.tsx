import type { Metadata } from "next";
import { AuthCard } from "@/components/site/AuthCard";
import { ActionForm } from "@/components/forms/ActionForm";
import { forgotPasswordAction } from "../auth-actions";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Reset your password" intro="Enter your email and we will send you a link to choose a new password.">
      <ActionForm
        action={forgotPasswordAction}
        submitLabel="Send reset link"
        fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email", required: true }]}
      />
    </AuthCard>
  );
}
