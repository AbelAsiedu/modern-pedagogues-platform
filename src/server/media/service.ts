import { createHash } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { recordAudit } from "../audit";
import type { Db } from "../db";
import { heroBanners, mediaFiles, products, tutorProfiles } from "../db/schema";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { can, type Actor } from "../permissions/authorize";

/** Largest file accepted from the browser. Larger photos from a phone are common, so this is generous; they are shrunk below. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Longest side kept after processing. Plenty for a full-width banner, small enough to load fast. */
export const MAX_DIMENSION = 2000;
const MAX_INPUT_PIXELS = 40_000_000;

const FORMATS = {
  jpeg: { contentType: "image/jpeg", ext: "jpg" },
  png: { contentType: "image/png", ext: "png" },
  webp: { contentType: "image/webp", ext: "webp" },
} as const;
type FormatName = keyof typeof FORMATS;

/** Staff who manage a page, the shop or tutors may upload pictures for it. */
export function canUploadMedia(actor: Actor | null): actor is Actor {
  return can(actor, "content.manage_site") || can(actor, "commerce.manage_products") || can(actor, "tutors.review_applications");
}
function assertCanUpload(actor: Actor | null): asserts actor is Actor {
  if (!canUploadMedia(actor)) throw new ForbiddenError("missing permission: upload media");
}

export type ProcessedImage = { data: Buffer; contentType: string; ext: string; width: number; height: number };

/**
 * Decode and re-encode an upload. The browser's claimed type and the file name are ignored: the bytes must be a
 * real JPEG, PNG or WebP image. Re-encoding drops EXIF (including GPS location), embedded scripts and anything
 * appended to the file, applies phone rotation, and caps the size. SVG and GIF are refused.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const fail = (m: string) => new ValidationError({ file: [m] }, m);
  if (input.length === 0) throw fail("Choose an image to upload.");
  if (input.length > MAX_UPLOAD_BYTES) throw fail("That image is too large (5 MB maximum).");
  const bad = () => fail("Upload a JPEG, PNG or WebP image.");
  let format: string | undefined;
  try {
    format = (await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
  } catch {
    throw bad();
  }
  if (!format || !(format in FORMATS)) throw bad();
  const f = FORMATS[format as FormatName];
  try {
    let pipeline = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true });
    pipeline = format === "jpeg" ? pipeline.jpeg({ quality: 85 }) : format === "png" ? pipeline.png() : pipeline.webp({ quality: 85 });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return { data, contentType: f.contentType, ext: f.ext, width: info.width, height: info.height };
  } catch {
    throw bad();
  }
}

export function mediaPath(row: { id: string; contentType: string }): string {
  const ext = Object.values(FORMATS).find((f) => f.contentType === row.contentType)?.ext ?? "jpg";
  return `/media/${row.id}.${ext}`;
}

const cleanName = (name: string) =>
  (name.split(/[\\/]/).pop() ?? "").replace(/[^\w .()-]/g, "").replace(/^\.+/, "").trim().slice(0, 120) || "image";

export async function saveImage(
  db: Db,
  actor: Actor | null,
  input: { filename: string; bytes: Buffer; altText?: string },
  ip?: string | null,
) {
  assertCanUpload(actor);
  const img = await processImage(input.bytes);
  const [row] = await db
    .insert(mediaFiles)
    .values({
      filename: cleanName(input.filename),
      contentType: img.contentType,
      byteSize: img.data.length,
      width: img.width,
      height: img.height,
      sha256: createHash("sha256").update(img.data).digest("hex"),
      altText: (input.altText ?? "").trim().slice(0, 200),
      data: img.data,
      uploadedById: actor.id,
    })
    .returning({ id: mediaFiles.id, contentType: mediaFiles.contentType });
  await recordAudit(db, { actorId: actor.id, action: "media.uploaded", entityType: "media", entityId: row!.id, metadata: { bytes: img.data.length }, ip });
  return { id: row!.id, path: mediaPath(row!) };
}

/** Everything about the pictures except their bytes, newest first. */
export async function listMedia(db: Db, actor: Actor | null) {
  assertCanUpload(actor);
  const rows = await db
    .select({
      id: mediaFiles.id,
      filename: mediaFiles.filename,
      contentType: mediaFiles.contentType,
      byteSize: mediaFiles.byteSize,
      width: mediaFiles.width,
      height: mediaFiles.height,
      altText: mediaFiles.altText,
      createdAt: mediaFiles.createdAt,
    })
    .from(mediaFiles)
    .orderBy(desc(mediaFiles.createdAt));
  return rows.map((r) => ({ ...r, path: mediaPath(r) }));
}

/** Options for an "Image" drop-down on any admin form. */
export async function mediaOptions(db: Db, actor: Actor | null): Promise<{ value: string; label: string }[]> {
  return (await listMedia(db, actor)).map((m) => ({ value: m.path, label: `${m.filename} (${m.width}×${m.height})` }));
}

/** The bytes for the public /media route. No permission check: these pictures are public. */
export async function getMediaFile(db: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await db
    .select({ data: mediaFiles.data, contentType: mediaFiles.contentType, sha256: mediaFiles.sha256 })
    .from(mediaFiles)
    .where(eq(mediaFiles.id, id))
    .limit(1);
  return row ?? null;
}

export async function updateMediaAlt(db: Db, actor: Actor | null, id: string, altText: string, ip?: string | null) {
  assertCanUpload(actor);
  const res = await db.update(mediaFiles).set({ altText: altText.trim().slice(0, 200) }).where(eq(mediaFiles.id, id)).returning({ id: mediaFiles.id });
  if (res.length === 0) throw new NotFoundError("Image not found.");
  await recordAudit(db, { actorId: actor.id, action: "media.updated", entityType: "media", entityId: id, ip });
}

/** Places a picture is in use, so it is never deleted from under a live page. */
export async function mediaUsage(db: Db, path: string): Promise<string[]> {
  const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const used: string[] = [];
  if (await count(db.select({ n: sql<number>`count(*)::int` }).from(heroBanners).where(eq(heroBanners.imagePath, path)))) used.push("a home banner");
  if (await count(db.select({ n: sql<number>`count(*)::int` }).from(tutorProfiles).where(eq(tutorProfiles.photoPath, path)))) used.push("a tutor profile");
  if (await count(db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.coverPath, path)))) used.push("a shop product");
  return used;
}

export async function deleteMedia(db: Db, actor: Actor | null, id: string, ip?: string | null) {
  assertCanUpload(actor);
  const [row] = await db.select({ id: mediaFiles.id, contentType: mediaFiles.contentType }).from(mediaFiles).where(eq(mediaFiles.id, id)).limit(1);
  if (!row) throw new NotFoundError("Image not found.");
  const used = await mediaUsage(db, mediaPath(row));
  if (used.length > 0) throw new ConflictError(`This image is still used by ${used.join(", ")}. Change that first.`);
  await db.delete(mediaFiles).where(eq(mediaFiles.id, id));
  await recordAudit(db, { actorId: actor.id, action: "media.deleted", entityType: "media", entityId: id, ip });
}
