import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/site/AuthCard";
import { ActionForm } from "@/components/forms/ActionForm";
import { GoogleButton, OrDivider } from "@/components/site/GoogleButton";
import { googleConfig } from "@/server/context";
import { registerAction } from "../auth-actions";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  const google = googleConfig() !== null;
  return (
    <AuthCard
      title="Create an account"
      intro="For parents and students. Tutors and marketplace creators apply separately."
      footer={<p>Already registered? <Link href="/login" className="underline">Sign in</Link></p>}
    >
      {google ? (
        <>
          <div className="space-y-3">
            <GoogleButton label="Sign up with Google as a parent" role="parent" />
            <GoogleButton label="Sign up with Google as a student" role="student" />
          </div>
          <OrDivider />
        </>
      ) : null}
      <ActionForm
        action={registerAction}
        submitLabel="Create account"
        fields={[
          { name: "fullName", label: "Full name", autoComplete: "name", required: true },
          { name: "email", label: "Email", type: "email", autoComplete: "email", required: true },
          { name: "phone", label: "Phone (optional)", type: "tel", autoComplete: "tel" },
          {
            name: "role",
            label: "I am a",
            type: "select",
            required: true,
            defaultValue: "parent",
            options: [
              { value: "parent", label: "Parent or guardian" },
              { value: "student", label: "Student" },
            ],
          },
          { name: "password", label: "Password", type: "password", autoComplete: "new-password", required: true, hint: "At least 12 characters. A short phrase works well." },
        ]}
      />
    </AuthCard>
  );
}
