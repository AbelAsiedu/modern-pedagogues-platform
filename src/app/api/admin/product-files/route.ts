import { NextResponse } from "next/server";
import { getActor, requestContext } from "@/server/context";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { toErrorResponse } from "@/server/errors";
import { logger } from "@/server/logger";
import { can } from "@/server/permissions/authorize";
import { attachProductFile, MAX_FILE_BYTES } from "@/server/shop/service";

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
const fail = (status: number, message: string) => NextResponse.json({ ok: false, error: message }, { status });

/** Attach (or replace) a product's PDF. Sign-in and permission are checked before the body is read. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Request not allowed.");
  const actor = await getActor();
  if (!can(actor, "commerce.manage_products") && !can(actor, "portal.creator")) return fail(actor ? 403 : 401, actor ? "You do not have permission to upload resources." : "Please sign in again.");
  const length = Number(req.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length <= 0 || length > MAX_FILE_BYTES + 100_000) return fail(413, "That file is too large (15 MB maximum).");
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) return fail(415, "Send the file as a form upload.");
  try {
    const form = await req.formData();
    const file = form.get("file");
    const productId = String(form.get("productId") ?? "");
    if (!(file instanceof File)) return fail(400, "Choose a PDF to upload.");
    await attachProductFile(db(), actor, productId, { filename: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, (await requestContext()).ip);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    if (status >= 500) logger.error({ err }, "product file upload error");
    return fail(status, body.error.fieldErrors?.file?.[0] ?? body.error.message);
  }
}
