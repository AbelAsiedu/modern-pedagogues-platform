import { createHash } from "node:crypto";
import { and, count, desc, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { recordAudit } from "../audit";
import { enforceRateLimit } from "../auth/rate-limit";
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

/** Staff who manage a page, the shop or tutors may upload and see every picture. */
export function isMediaStaff(actor: Actor | null): boolean {
  return can(actor, "content.manage_site") || can(actor, "commerce.manage_products") || can(actor, "tutors.review_applications");
}
/** Staff, or a marketplace creator (who can only upload and see their own pictures, for their covers). */
export function canUploadMedia(actor: Actor | null): boolean {
  return isMediaStaff(actor) || can(actor, "portal.creator");
}
function assertCanUpload(actor: Actor | null): asserts actor is Actor {
  if (!actor || !canUploadMedia(actor)) throw new ForbiddenError("missing permission: upload media");
}
const CREATOR_IMAGE_LIMIT = 40;
const ownOnly = (actor: Actor) => (isMediaStaff(actor) ? undefined : eq(mediaFiles.uploadedById, actor.id));

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
  if (!isMediaStaff(actor)) {
    await enforceRateLimit(db, { key: `upload:image:${actor.id}`, limit: 20, windowSeconds: 3600 });
    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(mediaFiles).where(eq(mediaFiles.uploadedById, actor.id));
    if (n >= CREATOR_IMAGE_LIMIT) throw new ConflictError(`You can keep up to ${CREATOR_IMAGE_LIMIT} pictures. Delete ones you no longer use.`);
  }
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
    .where(ownOnly(actor))
    .orderBy(desc(mediaFiles.createdAt));
  return rows.map((r) => ({ ...r, path: mediaPath(r) }));
}

/** Options for an "Image" drop-down on any admin form. */
export async function mediaOptions(db: Db, actor: Actor | null): Promise<{ value: string; label: string }[]> {
  return (await listMedia(db, actor)).map((m) => ({ value: m.path, label: `${m.filename} (${m.width}×${m.height})` }));
}

/** Width and height of a library picture, found from its public path (/media/<id>.jpg). Null if there is no such picture. */
export async function mediaInfoByPath(db: Db, path: string): Promise<{ id: string; width: number; height: number; uploadedById: string | null } | null> {
  const m = /^\/media\/([0-9a-f-]{36})\.(jpg|png|webp)$/.exec(path);
  if (!m) return null;
  const [row] = await db.select({ id: mediaFiles.id, width: mediaFiles.width, height: mediaFiles.height, uploadedById: mediaFiles.uploadedById }).from(mediaFiles).where(eq(mediaFiles.id, m[1]!)).limit(1);
  return row ?? null;
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
  const res = await db.update(mediaFiles).set({ altText: altText.trim().slice(0, 200) }).where(and(eq(mediaFiles.id, id), ownOnly(actor))).returning({ id: mediaFiles.id });
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
  const [row] = await db.select({ id: mediaFiles.id, contentType: mediaFiles.contentType }).from(mediaFiles).where(and(eq(mediaFiles.id, id), ownOnly(actor))).limit(1);
  if (!row) throw new NotFoundError("Image not found.");
  const used = await mediaUsage(db, mediaPath(row));
  if (used.length > 0) throw new ConflictError(`This image is still used by ${used.join(", ")}. Change that first.`);
  await db.delete(mediaFiles).where(eq(mediaFiles.id, id));
  await recordAudit(db, { actorId: actor.id, action: "media.deleted", entityType: "media", entityId: id, ip });
}

/**
 * Swap a picture for a new one everywhere it is used. The new picture is stored under a new address (addresses are
 * cached for a year), then every home banner, tutor photo and resource cover that pointed at the old address is moved
 * to the new one in the same transaction, and the old picture is removed. The description is kept unless a new one is given.
 */
export async function replaceMedia(
  db: Db,
  actor: Actor | null,
  id: string,
  input: { filename: string; bytes: Buffer; altText?: string },
  ip?: string | null,
) {
  assertCanUpload(actor);
  if (!isMediaStaff(actor)) throw new ForbiddenError("missing permission: replace media");
  const img = await processImage(input.bytes);
  return db.transaction(async (tx) => {
    const [old] = await tx.select({ id: mediaFiles.id, contentType: mediaFiles.contentType, altText: mediaFiles.altText }).from(mediaFiles).where(eq(mediaFiles.id, id)).limit(1);
    if (!old) throw new NotFoundError("Image not found.");
    const oldPath = mediaPath(old);
    const [row] = await tx
      .insert(mediaFiles)
      .values({
        filename: cleanName(input.filename),
        contentType: img.contentType,
        byteSize: img.data.length,
        width: img.width,
        height: img.height,
        sha256: createHash("sha256").update(img.data).digest("hex"),
        altText: (input.altText?.trim() ? input.altText.trim() : old.altText).slice(0, 200),
        data: img.data,
        uploadedById: actor.id,
      })
      .returning({ id: mediaFiles.id, contentType: mediaFiles.contentType });
    const newPath = mediaPath(row!);
    const moved = {
      banners: (await tx.update(heroBanners).set({ imagePath: newPath }).where(eq(heroBanners.imagePath, oldPath)).returning({ id: heroBanners.id })).length,
      tutors: (await tx.update(tutorProfiles).set({ photoPath: newPath }).where(eq(tutorProfiles.photoPath, oldPath)).returning({ id: tutorProfiles.id })).length,
      resources: (await tx.update(products).set({ coverPath: newPath }).where(eq(products.coverPath, oldPath)).returning({ id: products.id })).length,
    };
    await tx.delete(mediaFiles).where(eq(mediaFiles.id, id));
    await recordAudit(tx, { actorId: actor.id, action: "media.replaced", entityType: "media", entityId: row!.id, metadata: { replaced: id, ...moved }, ip });
    return { id: row!.id, path: newPath, moved };
  });
}
