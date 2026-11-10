"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/server/action-result";
import { emailDeps, paymentDeps, requireActor } from "@/server/context";
import { db } from "@/server/db";
import { startPaystackCheckout } from "@/server/payments/orders";
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

/** Send the buyer to Paystack's secure page to pay for an order of theirs. */
export async function payWithPaystackAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const url = await startPaystackCheckout(paymentDeps(), actor, str(form, "orderId"));
    redirect(url);
  });
}
