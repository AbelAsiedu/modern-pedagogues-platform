import type { Logger } from "../logger";

export type EmailMessage = { to: string; subject: string; text: string; html?: string };

export interface Mailer {
  send(message: EmailMessage): Promise<{ providerId: string }>;
}

/**
 * Development mailer: writes the message to the log instead of sending it. This is NOT an email
 * integration. Production configuration validation rejects EMAIL_PROVIDER=console.
 */
export class ConsoleMailer implements Mailer {
  constructor(private readonly log: Logger) {}
  async send(message: EmailMessage) {
    this.log.info({ to: message.to, subject: message.subject, body: message.text }, "email (console mailer, not delivered)");
    return { providerId: "console" };
  }
}

/** Test double that records what would have been sent. */
export class MemoryMailer implements Mailer {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
    return { providerId: `memory-${this.sent.length}` };
  }
  last(): EmailMessage | undefined {
    return this.sent[this.sent.length - 1];
  }
}

/** Pull the first absolute URL out of a message body (tests and dev tooling). */
export function extractLink(text: string): string | undefined {
  return /https?:\/\/\S+/.exec(text)?.[0];
}
