import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, ts, users } from "./identity";

/**
 * A sign-in provider account linked to a user (today only Google). `subject` is the provider's permanent id for the
 * person (Google's "sub"); the email can change on Google's side, the subject cannot, so the subject is what we trust.
 */
export const oauthIdentities = pgTable(
  "oauth_identities",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    subject: text("subject").notNull(),
    /** The email the provider reported at the last sign-in; informational only. */
    email: text("email").notNull(),
    lastLoginAt: ts("last_login_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("oauth_identities_provider_subject_uq").on(t.provider, t.subject),
    uniqueIndex("oauth_identities_user_provider_uq").on(t.userId, t.provider),
  ],
);
