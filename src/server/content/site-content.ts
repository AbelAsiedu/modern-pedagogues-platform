import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "../audit";
import type { Db, DbOrTx } from "../db";
import { siteContent } from "../db/schema";
import { ForbiddenError, ValidationError } from "../errors";
import { assertCan, can, type Actor } from "../permissions/authorize";
import { CONTENT_ENTRIES, CONTENT_GROUPS, getEntry, type ContentEntry, type ContentGroupId } from "./registry";
import { fillTemplate, templateVars } from "@/lib/site-content";

/** Normalise line endings and trim; the stored value never has CR characters. */
const clean = (v: string) => v.replace(/\r\n?/g, "\n").trim();

export type SiteText = {
  /** The raw value (edited or default), before {tokens} are filled. */
  raw(key: string): string;
  /** The value with {tokens} filled in: what visitors read. */
  text(key: string, extra?: Record<string, string>): string;
  /** A "lines" entry as a list, empty lines removed. */
  lines(key: string): string[];
};

export function buildSiteText(overrides: ReadonlyMap<string, string>): SiteText {
  const raw = (key: string) => {
    const o = overrides.get(key);
    if (o !== undefined) return o;
    const entry = getEntry(key);
    if (!entry) throw new Error(`Unknown site text key: ${key}`);
    return entry.default;
  };
  return {
    raw,
    text: (key, extra) => fillTemplate(raw(key), templateVars(extra)),
    lines: (key) =>
      fillTemplate(raw(key), templateVars())
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
  };
}

/** Never throws: if the database is unavailable the site shows its default text. */
export async function loadSiteText(db: DbOrTx | (() => DbOrTx)): Promise<SiteText> {
  try {
    const rows = await (typeof db === "function" ? db() : db).select().from(siteContent);
    return buildSiteText(new Map(rows.map((r) => [r.key, r.value])));
  } catch {
    return buildSiteText(new Map());
  }
}

export type EditableEntry = ContentEntry & { value: string; isCustom: boolean };

/** The groups and entries this actor may edit, with their current values. */
export async function listEditableContent(db: DbOrTx, actor: Actor | null) {
  assertCan(actor, "content.manage_site");
  const rows = await db.select().from(siteContent);
  const overrides = new Map(rows.map((r) => [r.key, r.value]));
  return CONTENT_GROUPS.map((g) => ({
    ...g,
    entries: CONTENT_ENTRIES.filter((x) => x.group === g.id && can(actor, x.permission)).map(
      (x): EditableEntry => ({ ...x, value: overrides.get(x.key) ?? x.default, isCustom: overrides.has(x.key) }),
    ),
  })).filter((g) => g.entries.length > 0);
}

/**
 * Save one group's text. Each submitted value is compared with the default: identical (or empty) means
 * "use the default", so the override row is removed; anything else is stored. Atomic, audited, and every
 * key is checked against the registry and the actor's permission for that entry.
 */
export async function saveContentGroup(
  db: Db,
  actor: Actor | null,
  groupId: string,
  values: Readonly<Record<string, string>>,
  ip?: string | null,
) {
  assertCan(actor, "content.manage_site");
  const group = CONTENT_GROUPS.find((g) => g.id === groupId);
  if (!group) throw new ValidationError({ group: ["Unknown section."] });
  const entries = CONTENT_ENTRIES.filter((x) => x.group === (group.id as ContentGroupId));

  const toSet: { key: string; value: string }[] = [];
  const toReset: string[] = [];
  for (const entry of entries) {
    if (!(entry.key in values)) continue; // not submitted (for example, hidden from this actor)
    if (!can(actor, entry.permission)) throw new ForbiddenError("You cannot edit this text.");
    const value = clean(values[entry.key] ?? "");
    const parsed = z.string().max(entry.max, `${entry.label} is too long (maximum ${entry.max} characters).`).safeParse(value);
    if (!parsed.success) throw new ValidationError({ [entry.key]: [parsed.error.issues[0]?.message ?? "Invalid text."] });
    if (entry.kind !== "rich" && entry.kind !== "text" && entry.kind !== "lines" && value.includes("\n")) {
      throw new ValidationError({ [entry.key]: ["Use a single line."] });
    }
    if (value === "" || value === clean(entry.default)) toReset.push(entry.key);
    else toSet.push({ key: entry.key, value });
  }

  const changed: string[] = [];
  await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(siteContent)
      .where(inArray(siteContent.key, [...toSet.map((x) => x.key), ...toReset]));
    const before = new Map(existing.map((r) => [r.key, r.value]));
    for (const { key, value } of toSet) {
      if (before.get(key) === value) continue;
      await tx
        .insert(siteContent)
        .values({ key, value, updatedById: actor.id })
        .onConflictDoUpdate({ target: siteContent.key, set: { value, updatedById: actor.id, updatedAt: new Date() } });
      changed.push(key);
    }
    for (const key of toReset) {
      if (!before.has(key)) continue;
      await tx.delete(siteContent).where(eq(siteContent.key, key));
      changed.push(key);
    }
    if (changed.length > 0) {
      await recordAudit(tx, {
        actorId: actor.id,
        action: "site_content.updated",
        entityType: "site_content",
        entityId: group.id,
        metadata: { keys: changed },
        ip,
      });
    }
  });
  return { changed };
}
