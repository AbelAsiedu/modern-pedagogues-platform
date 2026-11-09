"use server";

import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/server/action-result";
import { can } from "@/server/permissions/authorize";
import { InvalidTokenError, MfaRequiredError } from "@/server/errors";
import {
  authService,
  clearMfaChallengeCookie,
  clearSessionCookie,
  getMfaChallengeCookie,
  getSession,
  requestContext,
  requireSession,
  safeNext,
  setMfaChallengeCookie,
  setSessionCookie,
} from "@/server/context";
import { cookies } from "next/headers";
import { cookieName } from "@/server/context";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requestContext();
    let token: string;
    try {
      ({ token } = await authService().login({ email: str(form, "email"), password: str(form, "password") }, ctx));
    } catch (err) {
      // Right password, two-step sign-in switched on: no session yet. Hand over to the code step.
      if (err instanceof MfaRequiredError) {
        await setMfaChallengeCookie(err.challenge);
        const next = str(form, "next");
        redirect(next ? `/login/two-step?next=${encodeURIComponent(next)}` : "/login/two-step");
      }
      throw err;
    }
    await setSessionCookie(token);
    redirect(await afterSignIn(str(form, "next")));
  });
}

/** Where a freshly signed-in person goes: staff to the admin area, everyone else to their account. */
async function afterSignIn(next: string): Promise<string> {
  const session = await getSession();
  const staff = session ? can(session.actor, "users.view") || can(session.actor, "content.manage_site") : false;
  // Staff who still have to set up two-step sign-in have no staff powers yet, so send them to do that.
  if (session?.mfaSetupRequired) return "/account/security?required=1";
  return safeNext(next, staff ? "/admin" : "/account");
}

/** Second sign-in step: the 6-digit code (or a recovery code) turns the ticket from the password step into a session. */
export async function twoStepLoginAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ticket = await getMfaChallengeCookie();
    if (!ticket) redirect("/login?expired=1");
    let token: string;
    try {
      ({ token } = await authService().mfa.completeLogin(ticket, str(form, "code"), await requestContext()));
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        await clearMfaChallengeCookie();
        redirect("/login?expired=1");
      }
      throw err;
    }
    await clearMfaChallengeCookie();
    await setSessionCookie(token);
    redirect(await afterSignIn(str(form, "next")));
  });
}

export async function startTwoStepSetupAction(): Promise<void> {
  const session = await requireSession("/account/security");
  await authService().mfa.beginSetup(session.user.id);
  redirect("/account/security");
}

export async function confirmTwoStepSetupAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireSession("/account/security");
    const { recoveryCodes } = await authService().mfa.confirmSetup(session.user.id, session.sessionId, str(form, "code"), await requestContext());
    return { ok: true, message: "Two-step sign-in is on. You were signed out of your other devices.", codes: recoveryCodes };
  });
}

export async function disableTwoStepAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireSession("/account/security");
    await authService().mfa.disable(session.user.id, session.sessionId, { password: str(form, "password"), code: str(form, "code") }, await requestContext());
    redirect("/account/security?off=1");
  });
}

export async function regenerateRecoveryCodesAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireSession("/account/security");
    const { recoveryCodes } = await authService().mfa.regenerateRecoveryCodes(
      session.user.id,
      { password: str(form, "password"), code: str(form, "code") },
      await requestContext(),
    );
    return { ok: true, message: "New recovery codes created. The old ones no longer work.", codes: recoveryCodes };
  });
}

export async function registerAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await authService().register(
      {
        email: str(form, "email"),
        fullName: str(form, "fullName"),
        phone: str(form, "phone") || undefined,
        password: str(form, "password"),
        role: str(form, "role") as "student" | "parent",
      },
      await requestContext(),
    );
    return { ok: true, message: "Check your email for a link to confirm your address. If you already have an account, we have emailed you instead." };
  });
}

export async function resendVerificationAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await authService().resendVerification(str(form, "email"), await requestContext());
    return { ok: true, message: "If that address has an account waiting to be confirmed, we have sent a new link. It can take a minute to arrive; check your spam folder too." };
  });
}

export async function verifyEmailAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await authService().verifyEmail(str(form, "token"), await requestContext());
    redirect("/login?verified=1");
  });
}

export async function forgotPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await authService().requestPasswordReset(str(form, "email"), await requestContext());
    return { ok: true, message: "If that email has an account, we have sent a link to set a new password. It expires in one hour." };
  });
}

export async function resetPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await authService().resetPassword(str(form, "token"), str(form, "password"), await requestContext());
    redirect("/login?reset=1");
  });
}

export async function changePasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireSession("/account");
    await authService().changePassword(
      session.user.id,
      session.sessionId,
      { currentPassword: str(form, "currentPassword"), newPassword: str(form, "newPassword") },
      await requestContext(),
    );
    return { ok: true, message: "Password changed. You have been signed out of other devices." };
  });
}

export async function logoutAction(): Promise<void> {
  const token = (await cookies()).get(cookieName())?.value;
  await authService().logout(token);
  await clearSessionCookie();
  redirect("/");
}
