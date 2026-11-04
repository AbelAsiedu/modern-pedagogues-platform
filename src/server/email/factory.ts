import type { Env } from "../env";
import type { Logger } from "../logger";
import { ConsoleMailer, type Mailer } from "./mailer";
import { SmtpMailer } from "./smtp";

export function createMailer(env: Env, log: Logger): Mailer {
  if (env.EMAIL_PROVIDER === "smtp") {
    // env validation guarantees these are present when EMAIL_PROVIDER=smtp
    return new SmtpMailer({
      host: env.SMTP_HOST!,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER!,
      password: env.SMTP_PASSWORD!,
      from: env.EMAIL_FROM,
    });
  }
  return new ConsoleMailer(log);
}
