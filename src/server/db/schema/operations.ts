import { index, integer, jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, ts, users } from "./identity";

/**
 * Append-only. The init migration installs triggers that reject UPDATE, DELETE and TRUNCATE,
 * so neither application code nor admin screens can rewrite history.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    // RESTRICT, not SET NULL: the append-only trigger forbids the UPDATE that SET NULL would perform,
    // and users with audit history should be suspended or anonymised, never hard-deleted.
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "restrict" }),
    /** Dotted action name, for example "user.role_assigned". */
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_actor_idx").on(t.actorId, t.createdAt),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_action_idx").on(t.action, t.createdAt),
  ],
);

export const emailDeliveryStatus = pgEnum("email_delivery_status", ["QUEUED", "SENT", "FAILED"]);

export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id: id(),
    toEmail: text("to_email").notNull(),
    template: text("template").notNull(),
    subject: text("subject").notNull(),
    status: emailDeliveryStatus("status").notNull().default("QUEUED"),
    attempts: integer("attempts").notNull().default(0),
    providerId: text("provider_id"),
    error: text("error"),
    createdAt: createdAt(),
    sentAt: ts("sent_at"),
  },
  (t) => [index("email_deliveries_status_idx").on(t.status, t.createdAt)],
);

/** Admin-managed settings: indicative tutoring rate, contact details, feature switches. */
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
