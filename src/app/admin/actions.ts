"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/server/action-result";
import { assignRole, restoreUser, revokeRole, suspendUser } from "@/server/admin/users";
import { createKnowledge, deleteKnowledge, updateKnowledge } from "@/server/assistant/knowledge";
import { setAssistantEnabled, testProviders } from "@/server/assistant/service";
import { saveContentGroup } from "@/server/content/site-content";
import { createBanner, deleteBanner, setBannerActive, updateBanner } from "@/server/content/banners";
import { assistantProviders, emailDeps, requestContext, requireActor } from "@/server/context";
import { setImageSlot } from "@/server/content/images";
import { deleteMedia, updateMediaAlt } from "@/server/media/service";
import { cancelOrderByStaff, createProduct, deleteProduct, markOrderPaid, setProductPublished, updateProduct } from "@/server/shop/service";
import { listingFromForm } from "@/lib/listing-form";
import { decideResource, restoreResource, suspendResource } from "@/server/resources/review";
import { recordPayout, setCreatorSuspended } from "@/server/resources/payouts";
import { CRITERIA } from "@/server/resources/quality";
import { createTutorByAdmin, decideTutor, deleteTutor, setTutorPublished, updateTutorPrivateDetails, updateTutorProfile } from "@/server/tutors/service";
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
        photoPath: str(form, "photoPath"),
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

function knowledgeFromForm(form: FormData) {
  return {
    title: str(form, "title"),
    body: str(form, "body"),
    isActive: form.get("isActive") === "on",
    sortOrder: str(form, "sortOrder") || "0",
  };
}

export async function createKnowledgeAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await createKnowledge(db(), actor, knowledgeFromForm(form), (await requestContext()).ip);
    revalidatePath("/admin/assistant");
    return { ok: true, message: "Added. Kaitlyn will use it from her next answer." };
  });
}

export async function updateKnowledgeAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await updateKnowledge(db(), actor, str(form, "entryId"), knowledgeFromForm(form), (await requestContext()).ip);
    revalidatePath("/admin/assistant");
    return { ok: true, message: "Saved." };
  });
}

export async function deleteKnowledgeAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await deleteKnowledge(db(), actor, str(form, "entryId"), (await requestContext()).ip);
    revalidatePath("/admin/assistant");
    return { ok: true, message: "Deleted." };
  });
}

export async function toggleAssistantAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await setAssistantEnabled(db(), actor, str(form, "enabled") === "true", (await requestContext()).ip);
    revalidatePath("/", "layout");
    return { ok: true, message: "Updated." };
  });
}

export async function updateTutorDetailsAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await updateTutorPrivateDetails(
      db(),
      actor,
      str(form, "tutorId"),
      { fullName: str(form, "fullName"), email: str(form, "email"), phone: str(form, "phone"), qualifications: str(form, "qualifications"), experience: str(form, "experience"), availability: str(form, "availability") },
      (await requestContext()).ip,
    );
    revalidatePath("/admin/tutors", "layout");
    return { ok: true, message: "Saved." };
  });
}

export async function deleteTutorAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    if (str(form, "confirm").trim().toLowerCase() !== "delete") return { ok: false, error: "Type delete to confirm." , fieldErrors: { confirm: ["Type the word delete to confirm."] } };
    await deleteTutor(db(), actor, str(form, "tutorId"), (await requestContext()).ip);
    revalidatePath("/admin/tutors", "layout");
    revalidatePath("/tutors", "layout");
    redirect("/admin/tutors");
  });
}

export async function updateMediaAltAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await updateMediaAlt(db(), actor, str(form, "mediaId"), str(form, "altText"), (await requestContext()).ip);
    revalidatePath("/admin/media");
    return { ok: true, message: "Saved." };
  });
}

export async function setImageSlotAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const path = str(form, "path");
    await setImageSlot(db(), actor, str(form, "slot"), path, (await requestContext()).ip);
    revalidatePath("/admin/images");
    return { ok: true, message: path ? "Saved. The picture is now showing." : "Removed. The built-in illustration is showing." };
  });
}

export async function deleteMediaAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await deleteMedia(db(), actor, str(form, "mediaId"), (await requestContext()).ip);
    revalidatePath("/admin/media");
    return { ok: true, message: "Deleted." };
  });
}

// ---------- shop ----------

const productFromForm = (form: FormData) => listingFromForm(form, true);

export async function createProductAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await createProduct(db(), actor, productFromForm(form), (await requestContext()).ip);
    revalidatePath("/admin/shop");
    return { ok: true, message: "Resource added. Open it below to upload the PDF, then publish." };
  });
}

export async function setProductPublishedAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const show = str(form, "show") === "1";
    await setProductPublished(db(), actor, str(form, "productId"), show, (await requestContext()).ip);
    revalidatePath("/admin/shop");
    revalidatePath("/resources", "layout");
    revalidatePath("/");
    return { ok: true, message: show ? "It is now on the Resources page." : "Hidden from the Resources page." };
  });
}

export async function updateProductAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await updateProduct(db(), actor, str(form, "productId"), productFromForm(form), (await requestContext()).ip);
    revalidatePath("/admin/shop");
    revalidatePath("/resources", "layout");
    return { ok: true, message: "Saved." };
  });
}

export async function deleteProductAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await deleteProduct(db(), actor, str(form, "productId"), (await requestContext()).ip);
    revalidatePath("/admin/shop");
    return { ok: true, message: "Deleted." };
  });
}

export async function markOrderPaidAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await markOrderPaid({ ...emailDeps(), notifyEmail: undefined }, actor, str(form, "orderId"), str(form, "note"), (await requestContext()).ip);
    revalidatePath("/admin/orders");
    return { ok: true, message: "Marked as paid. The buyer has been emailed." };
  });
}

export async function cancelOrderAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await cancelOrderByStaff(db(), actor, str(form, "orderId"), (await requestContext()).ip);
    revalidatePath("/admin/orders");
    return { ok: true, message: "Cancelled." };
  });
}

export async function testAssistantAction(): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const providers = assistantProviders();
    if (providers.length === 0) return { ok: false, error: "No AI key is set on the server yet, so there is nothing to test. See the steps above." };
    const results = await testProviders(providers, actor);
    const text = results.map((r) => `${r.provider}: ${r.detail}`).join(" ");
    return results.every((r) => r.ok) ? { ok: true, message: text } : { ok: false, error: text };
  });
}

// ---------- resource review (creator marketplace) ----------

export async function decideResourceAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const scores: Record<string, number> = {};
    for (const c of CRITERIA) {
      const v = str(form, `score_${c.key}`);
      if (v !== "") scores[c.key] = Number(v);
    }
    const id = str(form, "productId");
    await decideResource(
      { ...emailDeps(), notifyEmail: undefined },
      actor,
      id,
      { decision: str(form, "decision"), submission: str(form, "submission"), note: str(form, "note"), scores },
      (await requestContext()).ip,
    );
    revalidatePath("/admin/review");
    revalidatePath(`/admin/review/${id}`);
    revalidatePath("/resources", "layout");
    return { ok: true, message: "Decision recorded. The creator has been emailed." };
  });
}

export async function suspendResourceAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const id = str(form, "productId");
    await suspendResource({ ...emailDeps(), notifyEmail: undefined }, actor, id, str(form, "reason"), (await requestContext()).ip);
    revalidatePath("/admin/review");
    revalidatePath(`/admin/review/${id}`);
    revalidatePath("/resources", "layout");
    return { ok: true, message: "Taken down. The creator has been emailed the reason." };
  });
}

export async function restoreResourceAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const id = str(form, "productId");
    await restoreResource(db(), actor, id, (await requestContext()).ip);
    revalidatePath("/admin/review");
    revalidatePath(`/admin/review/${id}`);
    revalidatePath("/resources", "layout");
    return { ok: true, message: "Restored to the Resources page." };
  });
}

export async function recordPayoutAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await recordPayout(emailDeps(), actor, str(form, "creatorId"), { amount: str(form, "amount"), reference: str(form, "reference") }, (await requestContext()).ip);
    revalidatePath("/admin/creators");
    return { ok: true, message: "Payout recorded. The creator has been emailed." };
  });
}

export async function setCreatorSuspendedAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const suspend = str(form, "suspend") === "1";
    await setCreatorSuspended(db(), actor, str(form, "creatorId"), suspend, (await requestContext()).ip);
    revalidatePath("/admin/creators");
    return { ok: true, message: suspend ? "Creator suspended." : "Creator restored." };
  });
}
