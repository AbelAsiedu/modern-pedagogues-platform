import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { emailDeliveries } from "../db/schema";
import type { Logger } from "../logger";
import type { EmailMessage, Mailer } from "./mailer";

export type DeliverDeps = { db: Db; mailer: Mailer; log: Logger; now?: () => Date };

/**
 * Queue, send and record an email. A delivery failure is logged and recorded in email_deliveries but
 * never thrown, so a mail outage cannot break the action that triggered the email.
 */
export async function deliverEmail(deps: DeliverDeps, message: EmailMessage & { template: string }): Promise<void> {
  const { db, mailer, log } = deps;
  const now = () => (deps.now ? deps.now() : new Date());
  const [row] = await db
    .insert(emailDeliveries)
    .values({ toEmail: message.to, template: message.template, subject: message.subject })
    .returning({ id: emailDeliveries.id });
  try {
    const { providerId } = await mailer.send(message);
    if (row) {
      await db.update(emailDeliveries).set({ status: "SENT", attempts: 1, providerId, sentAt: now() }).where(eq(emailDeliveries.id, row.id));
    }
  } catch (err) {
    log.error({ err, template: message.template }, "email delivery failed");
    if (row) {
      await db
        .update(emailDeliveries)
        .set({ status: "FAILED", attempts: 1, error: err instanceof Error ? err.message.slice(0, 500) : "unknown" })
        .where(eq(emailDeliveries.id, row.id));
    }
  }
}
