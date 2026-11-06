"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/server/action-result";
import { emailDeps, requireActor } from "@/server/context";
import { db } from "@/server/db";
import { cancelMyOrder, placeOrder } from "@/server/shop/service";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function buyAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await placeOrder(emailDeps(), actor, str(form, "slug"));
    revalidatePath("/account/orders");
    redirect("/account/orders");
  });
}

export async function cancelMyOrderAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await cancelMyOrder(db(), actor, str(form, "orderId"));
    revalidatePath("/account/orders");
    return { ok: true, message: "Order cancelled." };
  });
}
