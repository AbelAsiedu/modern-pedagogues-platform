import { getActor } from "@/server/context";
import { db } from "@/server/db";
import { getFreeDownload } from "@/server/shop/service";

export const dynamic = "force-dynamic";

/** A free resource's PDF for any signed-in account. Paid resources never come through here (see /api/downloads). */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const actor = await getActor();
  if (!actor) return new Response("Please sign in to download.", { status: 401, headers: { "Cache-Control": "no-store" } });
  const file = await getFreeDownload(db(), actor, slug).catch(() => null);
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
