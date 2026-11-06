import { NextResponse } from "next/server";
import { getActor, requestContext } from "@/server/context";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { toErrorResponse } from "@/server/errors";
import { logger } from "@/server/logger";
import { setImageSlot } from "@/server/content/images";
import { getEntry } from "@/server/content/registry";
import { canUploadMedia, MAX_UPLOAD_BYTES, replaceMedia, saveImage } from "@/server/media/service";
import { can } from "@/server/permissions/authorize";

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

/**
 * Image upload. Signed-in staff only, and the sign-in and permission are checked BEFORE the body is read, so an
 * outsider cannot make the server buffer large files. A multipart body carries a little overhead beyond the file.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Request not allowed.");
  const actor = await getActor();
  if (!canUploadMedia(actor)) return fail(actor ? 403 : 401, actor ? "You do not have permission to upload images." : "Please sign in again.");
  // ?slot=<key> uploads straight into a Site images slot. Checked before the body is read, like every other permission here.
  const slot = new URL(req.url).searchParams.get("slot");
  if (slot) {
    if (getEntry(slot)?.kind !== "image") return fail(400, "Unknown picture slot.");
    if (!can(actor, "content.manage_site")) return fail(403, "You do not have permission to change site pictures.");
  }
  const length = Number(req.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length <= 0 || length > MAX_UPLOAD_BYTES + 100_000) return fail(413, "That image is too large (5 MB maximum).");
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) return fail(415, "Send the image as a form upload.");
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail(400, "Choose an image to upload.");
    const input = { filename: file.name, bytes: Buffer.from(await file.arrayBuffer()), altText: String(form.get("altText") ?? "") };
    const ip = (await requestContext()).ip;
    const replaceId = String(form.get("replaceId") ?? "");
    if (replaceId) {
      const r = await replaceMedia(db(), actor, replaceId, input, ip);
      return NextResponse.json({ ok: true, id: r.id, path: r.path, moved: r.moved }, { headers: { "Cache-Control": "no-store" } });
    }
    const saved = await saveImage(db(), actor, input, ip);
    if (slot) await setImageSlot(db(), actor, slot, saved.path, ip);
    return NextResponse.json({ ok: true, id: saved.id, path: saved.path }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    if (status >= 500) logger.error({ err }, "media upload error");
    return fail(status, body.error.fieldErrors?.file?.[0] ?? body.error.message);
  }
}
