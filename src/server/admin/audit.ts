import { desc, eq } from "drizzle-orm";
import type { Db } from "../db";
import { auditLogs, users } from "../db/schema";
import { assertCan, type Actor } from "../permissions/authorize";

export async function listAuditLogs(db: Db, actor: Actor | null, limit = 100) {
  assertCan(actor, "audit.view");
  return db
    .select({
      id: auditLogs.id,
      createdAt: auditLogs.createdAt,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
      actorEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(limit, 500));
}
