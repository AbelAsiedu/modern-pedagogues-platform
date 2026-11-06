"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listingFromForm } from "@/lib/listing-form";
import { runAction, type ActionState } from "@/server/action-result";
import { emailDeps, requestContext, requireActor } from "@/server/context";
import { db } from "@/server/db";
import { becomeCreator, createListing, deleteListing, setListingVisibility, submitForReview, updateCreatorProfile, updateListing } from "@/server/resources/creators";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function joinCreatorAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await becomeCreator(
      db(),
      actor,
      { displayName: str(form, "displayName"), bio: str(form, "bio"), payoutPhone: str(form, "payoutPhone"), acceptTerms: form.get("acceptTerms") === "on" },
      (await requestContext()).ip,
    );
    revalidatePath("/creator");
    redirect("/creator");
  });
}

export async function createListingAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const id = await createListing(db(), actor, listingFromForm(form), (await requestContext()).ip);
    revalidatePath("/creator");
    redirect(`/creator/${id}`);
  });
}

export async function updateListingAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const id = str(form, "listingId");
    const r = await updateListing(db(), actor, id, listingFromForm(form), (await requestContext()).ip);
    revalidatePath("/creator");
    revalidatePath(`/creator/${id}`);
    revalidatePath("/resources", "layout");
    return {
      ok: true,
      message: r.sentBackToDraft ? "Saved. Because you changed what reviewers check, it is hidden until it is approved again. Submit it for review when you are ready." : "Saved.",
    };
  });
}

export async function submitListingAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const id = str(form, "listingId");
    await submitForReview(emailDeps(), actor, id, form.get("declarations") === "on", (await requestContext()).ip);
    revalidatePath("/creator");
    revalidatePath(`/creator/${id}`);
    return { ok: true, message: "Submitted. A reviewer will read it and email you the decision." };
  });
}

export async function listingVisibilityAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const id = str(form, "listingId");
    const show = str(form, "show") === "1";
    await setListingVisibility(db(), actor, id, show, (await requestContext()).ip);
    revalidatePath("/creator");
    revalidatePath(`/creator/${id}`);
    revalidatePath("/resources", "layout");
    return { ok: true, message: show ? "It is visible on the Resources page again." : "It is hidden from the Resources page." };
  });
}

export async function deleteListingAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await deleteListing(db(), actor, str(form, "listingId"), (await requestContext()).ip);
    revalidatePath("/creator");
    redirect("/creator");
  });
}

export async function updateProfileAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await updateCreatorProfile(db(), actor, { displayName: str(form, "displayName"), bio: str(form, "bio"), payoutPhone: str(form, "payoutPhone") }, (await requestContext()).ip);
    revalidatePath("/creator");
    return { ok: true, message: "Saved." };
  });
}
