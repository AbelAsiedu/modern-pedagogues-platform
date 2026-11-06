import { NextResponse } from "next/server";
import { listingFromForm } from "@/lib/listing-form";
import { getActor, requestContext } from "@/server/context";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { toErrorResponse } from "@/server/errors";
import { logger } from "@/server/logger";
import { can } from "@/server/permissions/authorize";
import { attachProductFile, createProduct, deleteProduct, MAX_FILE_BYTES, updateProduct } from "@/server/shop/service";

export const dynamic = "force-dynamic";

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const host = req.headers.get("host");
    return o.host === new URL(env().APP_URL).host || (host !== null && o.host === host);
  } catch {
    return false;
  }
}
const fail = (status: number, message: string, fieldErrors?: Record<string, string[]>) =>
  NextResponse.json({ ok: false, error: message, fieldErrors }, { status });

/**
 * Add one of TMP's own resources in a single step: the details, the PDF and (optionally) "publish now".
 * If the PDF is refused, nothing is kept, so there is never a half-finished entry to clean up.
 * Sign-in and permission are checked before the body is read.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Request not allowed.");
  const actor = await getActor();
  if (!can(actor, "commerce.manage_products")) return fail(actor ? 403 : 401, actor ? "You do not have permission to add resources." : "Please sign in again.");
  const length = Number(req.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length <= 0 || length > MAX_FILE_BYTES + 200_000) return fail(413, "That file is too large (15 MB maximum).");
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) return fail(415, "Send the form as a form upload.");

  const ip = (await requestContext()).ip;
  let createdId: string | null = null;
  try {
    const form = await req.formData();
    const file = form.get("file");
    const hasFile = file instanceof File && file.size > 0;
    const publishNow = form.get("publishNow") === "on";
    if (publishNow && !hasFile) return fail(400, "Choose the PDF to publish now, or untick “Publish now”.", { file: ["Choose the PDF, or untick “Publish now”."] });

    const listing = listingFromForm(form, true);
    createdId = await createProduct(db(), actor, { ...listing, isPublished: false }, ip);
    if (hasFile) {
      await attachProductFile(db(), actor, createdId, { filename: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, ip);
      if (publishNow) await updateProduct(db(), actor, createdId, { ...listing, isPublished: true }, ip);
    }
    return NextResponse.json({ ok: true, id: createdId, published: publishNow && hasFile, hasFile }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (createdId) await deleteProduct(db(), actor, createdId, ip).catch(() => undefined);
    const { status, body } = toErrorResponse(err);
    if (status >= 500) logger.error({ err }, "product create error");
    return fail(status, body.error.message, body.error.fieldErrors);
  }
}
