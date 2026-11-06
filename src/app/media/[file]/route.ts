import { db } from "@/server/db";
import { getMediaFile } from "@/server/media/service";

export const dynamic = "force-dynamic";

/** Public pictures uploaded by staff. The URL contains the file's id, so a cached copy never goes stale. */
export async function GET(req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const m = /^([0-9a-f-]{36})\.(jpg|png|webp)$/.exec(file);
  if (!m) return new Response("Not found", { status: 404 });
  const row = await getMediaFile(db(), m[1]!).catch(() => null);
  if (!row) return new Response("Not found", { status: 404 });
  const etag = `"${row.sha256}"`;
  const headers: Record<string, string> = {
    "Content-Type": row.contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
    // Even if a file were ever mis-served as a page, it could not run anything.
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": "inline",
  };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(row.data), { headers: { ...headers, "Content-Length": String(row.data.length) } });
}
