"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/server/action-result";
import { assignRole, restoreUser, revokeRole, suspendUser } from "@/server/admin/users";
import { saveContentGroup } from "@/server/content/site-content";
import { createBanner, deleteBanner, setBannerActive, updateBanner } from "@/server/content/banners";
import { emailDeps, requestContext, requireActor } from "@/server/context";
import { createTutorByAdmin, decideTutor, setTutorPublished, updateTutorProfile } from "@/server/tutors/service";
import { db } from "@/server/db";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function suspendUserAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await suspendUser(db(), actor, str(form, "userId"), str(form, "reason"), (await requestContext()).ip);
    revalidatePath("/admin/users");
    return { ok: true, message: "Suspended." };
  });
}

export async function restoreUserAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await restoreUser(db(), actor, str(form, "userId"), (await requestContext()).ip);
    revalidatePath("/admin/users");
    return { ok: true, message: "Restored." };
  });
}

export async function assignRoleAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await assignRole(db(), actor, str(form, "userId"), str(form, "role"), (await requestContext()).ip);
    revalidatePath("/admin/users");
    return { ok: true, message: "Role added." };
  });
}

export async function revokeRoleAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await revokeRole(db(), actor, str(form, "userId"), str(form, "role"), (await requestContext()).ip);
    revalidatePath("/admin/users");
    return { ok: true, message: "Role removed." };
  });
}

function bannerFromForm(form: FormData) {
  return {
    title: str(form, "title"),
    subtitle: str(form, "subtitle"),
    imagePath: str(form, "imagePath"),
    imageAlt: str(form, "imageAlt"),
    buttonText: str(form, "buttonText"),
    buttonUrl: str(form, "buttonUrl"),
    isActive: form.get("isActive") === "on",
    sortOrder: str(form, "sortOrder") || "0",
  };
}

export async function createBannerAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await createBanner(db(), actor, bannerFromForm(form) as never, (await requestContext()).ip);
    revalidatePath("/admin/banners");
    revalidatePath("/");
    return { ok: true, message: "Banner added." };
  });
}

export async function updateBannerAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await updateBanner(db(), actor, str(form, "bannerId"), bannerFromForm(form) as never, (await requestContext()).ip);
    revalidatePath("/admin/banners");
    revalidatePath("/");
    return { ok: true, message: "Saved." };
  });
}

export async function toggleBannerAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await setBannerActive(db(), actor, str(form, "bannerId"), str(form, "active") === "true", (await requestContext()).ip);
    revalidatePath("/admin/banners");
    revalidatePath("/");
    return { ok: true, message: "Updated." };
  });
}

export async function deleteBannerAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await deleteBanner(db(), actor, str(form, "bannerId"), (await requestContext()).ip);
    revalidatePath("/admin/banners");
    revalidatePath("/");
    return { ok: true, message: "Deleted." };
  });
}

export async function saveContentAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const values: Record<string, string> = {};
    for (const [k, v] of form.entries()) {
      if (typeof v === "string" && k !== "group" && !k.startsWith("$ACTION")) values[k] = v;
    }
    const { changed } = await saveContentGroup(db(), actor, str(form, "group"), values, (await requestContext()).ip);
    revalidatePath("/", "layout");
    return { ok: true, message: changed.length ? `Saved ${changed.length} change${changed.length === 1 ? "" : "s"}.` : "No changes to save." };
  });
}

export async function createTutorAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await createTutorByAdmin(db(), actor, { fullName: str(form, "fullName"), email: str(form, "email"), phone: str(form, "phone") }, (await requestContext()).ip);
    revalidatePath("/admin/tutors");
    return { ok: true, message: "Tutor added as pending. Open it to complete the profile." };
  });
}

export async function updateTutorAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await updateTutorProfile(
      db(),
      actor,
      str(form, "tutorId"),
      {
        displayName: str(form, "displayName"),
        headline: str(form, "headline"),
        bio: str(form, "bio"),
        subjects: str(form, "subjects"),
        levelKeys: form.getAll("levelKeys").map(String),
        curriculumKeys: form.getAll("curriculumKeys").map(String),
        modes: form.getAll("modes").map(String),
        areas: str(form, "areas"),
        yearsExperience: str(form, "yearsExperience"),
        sortOrder: str(form, "sortOrder") || "0",
        adminNotes: str(form, "adminNotes"),
      },
      (await requestContext()).ip,
    );
    revalidatePath("/admin/tutors", "layout");
    revalidatePath("/tutors", "layout");
    return { ok: true, message: "Saved." };
  });
}

export async function decideTutorAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await decideTutor(emailDeps(), actor, str(form, "tutorId"), { decision: str(form, "decision"), message: str(form, "message") }, (await requestContext()).ip);
    revalidatePath("/admin/tutors", "layout");
    revalidatePath("/tutors", "layout");
    return { ok: true, message: "Decision recorded and the applicant has been emailed." };
  });
}

export async function publishTutorAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await setTutorPublished(db(), actor, str(form, "tutorId"), str(form, "publish") === "true", (await requestContext()).ip);
    revalidatePath("/admin/tutors", "layout");
    revalidatePath("/tutors", "layout");
    return { ok: true, message: "Updated." };
  });
}
