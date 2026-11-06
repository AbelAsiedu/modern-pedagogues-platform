import { getActor } from "@/server/context";
import { db } from "@/server/db";
import { getDownload } from "@/server/shop/service";

export const dynamic = "force-dynamic";

/** The purchased PDF. Signed-in buyer of a PAID order, or staff. Everyone else gets the same plain 404. */
export async function GET(_req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params;
  const actor = await getActor();
  if (!actor) return new Response("Please sign in to download.", { status: 401, headers: { "Cache-Control": "no-store" } });
  const file = await getDownload(db(), actor, orderId).catch(() => null);
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
