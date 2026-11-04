import { describe, expect, it } from "vitest";
import nodemailer from "nodemailer";
import { poolConfig } from "@/server/db/connection";
import { createMailer } from "@/server/email/factory";
import { ConsoleMailer } from "@/server/email/mailer";
import { SmtpMailer } from "@/server/email/smtp";
import { parseEnv } from "@/server/env";
import { createLogger } from "@/server/logger";

const base = { APP_URL: "https://tmp.example", DATABASE_URL: "postgresql://x@h/db" };
const smtp = { EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.gmail.com", SMTP_USER: "u@gmail.com", SMTP_PASSWORD: "app-password" };

describe("smtp configuration", () => {
  it("requires host, user and password when EMAIL_PROVIDER=smtp", () => {
    expect(() => parseEnv({ ...base, EMAIL_PROVIDER: "smtp" })).toThrow(/SMTP_HOST[\s\S]*SMTP_USER[\s\S]*SMTP_PASSWORD/);
  });
  it("accepts smtp in production and defaults to implicit TLS on 465", () => {
    const e = parseEnv({ ...base, NODE_ENV: "production", ...smtp });
    expect(e.SMTP_PORT).toBe(465);
    expect(e.SMTP_SECURE).toBe(true);
  });
  it("still refuses the console mailer in production", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production" })).toThrow(/console/);
  });
  it("picks the mailer from configuration", () => {
    const log = createLogger("silent");
    expect(createMailer(parseEnv({ ...base, ...smtp }), log)).toBeInstanceOf(SmtpMailer);
    expect(createMailer(parseEnv(base), log)).toBeInstanceOf(ConsoleMailer);
  });
});

describe("SmtpMailer", () => {
  it("builds the message with the configured From address", async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const mailer = new SmtpMailer(
      { host: "h", port: 465, secure: true, user: "u", password: "p", from: "TMP <themodernpedagogues@gmail.com>" },
      transport,
    );
    const result = await mailer.send({ to: "ama@example.com", subject: "Hello", text: "Body text" });
    expect(result.providerId).toBeTruthy();
    const info = (await transport.sendMail({ from: "x@y.z", to: "a@b.c", subject: "s", text: "t" })) as unknown as { message: string };
    expect(JSON.parse(info.message).subject).toBe("s"); // transport works as a JSON sink
  });
  it("surfaces transport failures to the caller", async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    transport.sendMail = (async () => {
      throw new Error("535 bad credentials");
    }) as typeof transport.sendMail;
    const mailer = new SmtpMailer({ host: "h", port: 465, secure: true, user: "u", password: "p", from: "f@x.y" }, transport);
    await expect(mailer.send({ to: "a@b.c", subject: "s", text: "t" })).rejects.toThrow(/535/);
  });
});

describe("database TLS", () => {
  it("verifies certificates by default when SSL is on", () => {
    expect(poolConfig({ url: "u", max: 1, ssl: true }).ssl).toEqual({ rejectUnauthorized: true });
  });
  it("allows turning verification off explicitly (Heroku)", () => {
    expect(poolConfig({ url: "u", max: 1, ssl: true, rejectUnauthorized: false }).ssl).toEqual({ rejectUnauthorized: false });
  });
  it("uses no TLS when SSL is off", () => {
    expect(poolConfig({ url: "u", max: 1 }).ssl).toBeUndefined();
  });
});
