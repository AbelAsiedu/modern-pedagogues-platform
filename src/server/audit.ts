import type { DbOrTx } from "./db";
import { auditLogs } from "./db/schema";

export type AuditEvent = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Never put secrets, tokens, passwords or full card/phone numbers here. */
  metadata?: Record<string, unknown>;
  ip?: string | null;
};

/** Pass a transaction handle to make the audit record commit or roll back with the change it describes. */
export async function recordAudit(db: DbOrTx, event: AuditEvent): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: event.actorId ?? null,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    metadata: event.metadata ?? null,
    ip: event.ip ?? null,
  });
}
