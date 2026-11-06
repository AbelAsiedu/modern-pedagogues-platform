import { boolean, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, ts, users } from "./identity";

/**
 * Facts an administrator has written for Kaitlyn. Kaitlyn answers company questions only from these entries,
 * the public website text and the public tutor directory: never from private records.
 */
export const assistantKnowledge = pgTable(
  "assistant_knowledge",
  {
    id: id(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("assistant_knowledge_active_idx").on(t.isActive, t.sortOrder)],
);

/**
 * What visitors asked Kaitlyn and what she answered, so staff can spot gaps. No IP address or account is stored.
 * Visitors may type personal details into a chat, so rows are deleted after a retention period (purgeOldChatLogs).
 */
export const assistantChatLogs = pgTable(
  "assistant_chat_logs",
  {
    id: id(),
    createdAt: createdAt(),
    /** answered | fallback | blocked | unavailable */
    outcome: text("outcome").notNull(),
    provider: text("provider"),
    message: text("message").notNull(),
    answer: text("answer").notNull(),
    latencyMs: integer("latency_ms"),
  },
  (t) => [index("assistant_chat_logs_created_idx").on(t.createdAt), index("assistant_chat_logs_outcome_idx").on(t.outcome, t.createdAt)],
);
