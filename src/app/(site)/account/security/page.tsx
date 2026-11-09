import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/forms/ActionForm";
import { TwoStepSetupPanel } from "@/components/forms/TwoStepSetupPanel";
import { Notice } from "@/components/site/AuthCard";
import { qrSvg } from "@/lib/qr";
import { authService, getSession, requireSession, staffTwoStepEnforced } from "@/server/context";
import { STAFF_ROLES } from "@/server/permissions/catalog";
import { groupSecret } from "@/server/auth/totp";
import {
  confirmTwoStepSetupAction,
  disableTwoStepAction,
  regenerateRecoveryCodesAction,
  startTwoStepSetupAction,
} from "../../auth-actions";

export const metadata: Metadata = { title: "Two-step sign-in", robots: { index: false } };
export const dynamic = "force-dynamic";

const codeField = {
  name: "code",
  label: "Code from your app (or a recovery code)",
  type: "text",
  autoComplete: "one-time-code",
  required: true,
} as const;

export default async function SecurityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = await requireSession("/account/security");
  const mfa = authService().mfa;
  const available = mfa.available();
  const { state, recoveryRemaining } = await mfa.status(s.user.id);
  const pending = state === "pending" ? await mfa.pendingSetup(s.user.id, s.user.email) : null;
  const qr = pending ? qrSvg(pending.uri) : null;
  // Staff roles are withheld from an unprotected staff account, so ask the session, not the roles on the actor.
  const session = await getSession();
  const isStaff = Boolean(session?.mfaSetupRequired) || s.actor.roles.some((r) => STAFF_ROLES.includes(r));
  const enforced = staffTwoStepEnforced();

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm">
        <Link href="/account" className="underline">← My account</Link>
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Two-step sign-in</h1>
      <span className="mt-3 block h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
      <p className="mt-4 text-navy/80">
        A password can be guessed or stolen. With two-step sign-in, signing in also needs a 6-digit code from an app on your phone, so a stolen password is not enough.
      </p>

      {sp.required && enforced && state !== "on" ? (
        <div className="mt-6"><Notice tone="warn">Staff accounts must use two-step sign-in. Set it up below and your admin access will switch on straight away.</Notice></div>
      ) : null}
      {sp.off ? <div className="mt-6"><Notice>Two-step sign-in is now off for your account.</Notice></div> : null}

      {!available ? (
        <p className="mt-8 rounded-2xl border border-navy/10 bg-white p-6">
          Two-step sign-in has not been switched on for this website yet. The site owner needs to add its security key; the steps are in the deployment notes.
        </p>
      ) : state === "off" ? (
        <section className="mt-8 rounded-2xl border border-navy/10 bg-white p-6">
          <h2 className="text-xl font-semibold">Set it up in two minutes</h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-navy/85">
            <li>Install an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or Authy.</li>
            <li>Press the button below and scan the picture it shows.</li>
            <li>Type the 6-digit code your app displays, and save the recovery codes.</li>
          </ol>
          <form action={startTwoStepSetupAction} className="mt-5">
            <button className="rounded-full bg-royal px-6 py-2.5 text-sm font-semibold text-cream shadow hover:bg-royal-deep">Start setup</button>
          </form>
        </section>
      ) : state === "pending" ? (
        <section className="mt-8 rounded-2xl border border-navy/10 bg-white p-6">
          <TwoStepSetupPanel
            qrSvg={qr?.svg ?? null}
            keyText={pending ? groupSecret(pending.secret) : null}
            email={s.user.email}
            confirmAction={confirmTwoStepSetupAction}
            restartAction={startTwoStepSetupAction}
          />
        </section>
      ) : (
        <>
          <section className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-6">
            <h2 className="text-xl font-semibold text-green-900">Two-step sign-in is on</h2>
            <p className="mt-1 text-green-900/90">
              You have <strong>{recoveryRemaining}</strong> unused recovery {recoveryRemaining === 1 ? "code" : "codes"}.
              {recoveryRemaining <= 3 ? " That is getting low; make a new set below." : ""}
            </p>
          </section>

          <section className="mt-8 rounded-2xl border border-navy/10 bg-white p-6">
            <h2 className="text-xl font-semibold">Make new recovery codes</h2>
            <p className="mt-1 text-sm text-navy/80">The old codes stop working. You will be asked for your password and a code.</p>
            <div className="mt-4">
              <ActionForm
                action={regenerateRecoveryCodesAction}
                submitLabel="Make new codes"
                tone="quiet"
                fields={[{ name: "password", label: "Password", type: "password", autoComplete: "current-password", required: true }, codeField]}
              />
            </div>
          </section>

          <section className="mt-8 rounded-2xl border border-red-200 bg-white p-6">
            <h2 className="text-xl font-semibold">Turn off two-step sign-in</h2>
            <p className="mt-1 text-sm text-navy/80">
              {isStaff && enforced
                ? "This site requires it for staff. If you turn it off, your admin access stays locked until you set it up again."
                : "Your account goes back to password-only sign-in."}
            </p>
            <div className="mt-4">
              <ActionForm
                action={disableTwoStepAction}
                submitLabel="Turn off"
                tone="danger"
                fields={[{ name: "password", label: "Password", type: "password", autoComplete: "current-password", required: true }, codeField]}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
