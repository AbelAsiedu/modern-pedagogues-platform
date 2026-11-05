"use server";

import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/server/action-result";
import { can } from "@/server/permissions/authorize";
import {
  authService,
  clearSessionCookie,
  getSession,
  requestContext,
  requireSession,
  safeNext,
  setSessionCookie,
} from "@/server/context";
import { cookies } from "next/headers";
import { cookieName } from "@/server/context";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requestContext();
    const { token } = await authService().login({ email: str(form, "email"), password: str(form, "password") }, ctx);
    await setSessionCookie(token);
    const session = await getSession();
    const staff = session ? can(session.actor, "users.view") || can(session.actor, "content.manage_site") : false;
    redirect(safeNext(str(form, "next"), staff ? "/admin" : "/account"));
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
