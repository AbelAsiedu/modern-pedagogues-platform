import { getActor } from "@/server/context";
import { db } from "@/server/db";
import { can } from "@/server/permissions/authorize";
import { getReviewFile } from "@/server/resources/review";

export const dynamic = "force-dynamic";

/** The creator's PDF under review, for reviewers only. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await getActor();
  if (!actor) return new Response("Please sign in.", { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!can(actor, "marketplace.moderate")) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const file = await getReviewFile(db(), actor, id).catch(() => null);
  if (!file) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const safeName = file.filename.replace(/[^\w .()-]/g, "_");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Content-Length": String(file.data.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
