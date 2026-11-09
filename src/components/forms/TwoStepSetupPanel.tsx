"use client";

import { useState } from "react";
import { ActionForm } from "./ActionForm";
import type { ActionState } from "@/server/action-result";

/**
 * The scan-and-confirm step of two-step set-up. Once the person has confirmed, the picture and the key are
 * removed from the page and only the one-time recovery codes remain, so nobody is left looking at a stale QR code.
 */
export function TwoStepSetupPanel({
  qrSvg,
  keyText,
  email,
  confirmAction,
  restartAction,
}: {
  qrSvg: string | null;
  keyText: string | null;
  email: string;
  confirmAction: (state: ActionState, form: FormData) => Promise<ActionState>;
  restartAction: () => Promise<void>;
}) {
  const [done, setDone] = useState(false);
  return (
    <>
      {done ? null : (
        <>
          <h2 className="text-xl font-semibold">1. Scan this picture with your app</h2>
          {qrSvg ? (
            <div
              role="img"
              aria-label="QR code for your authenticator app"
              className="mt-4 h-56 w-56 max-w-full rounded-xl border border-navy/10"
              // The markup comes from our own generator and contains only numbers and path commands.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : (
            <p className="mt-3 text-red-700">The set-up code could not be read. Press “Start over” below.</p>
          )}
          {keyText ? (
            <p className="mt-4 text-sm">
              Cannot scan? In your app choose “Enter a setup key” and type this key, with the account name <strong>{email}</strong>:
              <span className="mt-2 block break-all rounded-lg bg-cream-deep px-3 py-2 font-mono text-base tracking-widest">{keyText}</span>
            </p>
          ) : null}
          <h2 className="mt-8 text-xl font-semibold">2. Type the 6-digit code it shows</h2>
        </>
      )}
      <div className="mt-3">
        <ActionForm
          action={confirmAction}
          onCodesShown={() => setDone(true)}
          submitLabel="Turn on two-step sign-in"
          fields={[{ name: "code", label: "6-digit code", type: "text", autoComplete: "one-time-code", required: true }]}
        />
      </div>
      {done ? null : (
        <form action={restartAction} className="mt-6">
          <button className="text-sm underline">Start over with a new picture</button>
        </form>
      )}
    </>
  );
}
