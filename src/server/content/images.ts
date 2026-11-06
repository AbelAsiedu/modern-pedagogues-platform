import { eq } from "drizzle-orm";
import { recordAudit } from "../audit";
import type { Db } from "../db";
import { siteContent } from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";
import { mediaInfoByPath } from "../media/service";
import { assertCan, type Actor } from "../permissions/authorize";
import { CONTENT_ENTRIES, getEntry } from "./registry";
import { loadSiteText } from "./site-content";

/** The pictures an administrator can place around the site, with what each currently shows. */
export async function listImageSlots(db: Db, actor: Actor | null) {
  assertCan(actor, "content.manage_site");
  const t = await loadSiteText(db);
  return CONTENT_ENTRIES.filter((x) => x.kind === "image").map((x) => ({
    key: x.key,
    label: x.label,
    help: x.help ?? "",
    path: t.image(x.key),
    alt: t.imageAlt(x.key),
  }));
}

/**
 * Put a library picture into a slot, or empty the slot (path "") so the built-in illustration returns.
 * The picture must already be in the media library.
 */
export async function setImageSlot(db: Db, actor: Actor | null, key: string, path: string, ip?: string | null) {
  assertCan(actor, "content.manage_site");
  const entry = getEntry(key);
  if (!entry || entry.kind !== "image") throw new ValidationError({ key: ["Unknown picture slot."] });
  const value = path.trim();
  if (value === "") {
    await db.delete(siteContent).where(eq(siteContent.key, key));
  } else {
    if (!/^\/media\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(value)) throw new ValidationError({ path: ["Choose a picture from the media library."] });
    if (!(await mediaInfoByPath(db, value))) throw new NotFoundError("That picture is not in the media library.");
    await db
      .insert(siteContent)
      .values({ key, value, updatedById: actor.id })
      .onConflictDoUpdate({ target: siteContent.key, set: { value, updatedById: actor.id, updatedAt: new Date() } });
  }
  await recordAudit(db, { actorId: actor.id, action: "site_image.set", entityType: "site_content", entityId: key, metadata: { cleared: value === "" }, ip });
}
