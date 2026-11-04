import nodemailer, { type Transporter } from "nodemailer";
import type { EmailMessage, Mailer } from "./mailer";

export type SmtpConfig = { host: string; port: number; secure: boolean; user: string; password: string; from: string };

/** Sends through any SMTP server (Gmail with an app password, or a transactional provider later). */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;
  constructor(private readonly config: SmtpConfig, transport?: Transporter) {
    this.transport =
      transport ??
      nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.password },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
  }

  async send(message: EmailMessage): Promise<{ providerId: string }> {
    const info = await this.transport.sendMail({
      from: this.config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { providerId: String(info.messageId ?? "smtp") };
  }
}
