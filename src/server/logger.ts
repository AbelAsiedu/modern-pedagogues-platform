import pino from "pino";

/**
 * Structured logger. Anything that could carry a credential is redacted by path, so a careless
 * `log.info({ req })` cannot leak a password, token, cookie or payment secret.
 */
export const REDACT_PATHS = [
  "password",
  "newPassword",
  "currentPassword",
  "passwordHash",
  "token",
  "rawToken",
  "tokenHash",
  "authorization",
  "cookie",
  "secret",
  "apiKey",
  "*.password",
  "*.newPassword",
  "*.currentPassword",
  "*.passwordHash",
  "*.token",
  "*.rawToken",
  "*.tokenHash",
  "*.authorization",
  "*.cookie",
  "*.secret",
  "*.apiKey",
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  'headers["x-paystack-signature"]',
];

export function createLogger(level = process.env.LOG_LEVEL ?? "info", destination?: pino.DestinationStream) {
  return pino(
    {
      level,
      redact: { paths: REDACT_PATHS, censor: "[redacted]" },
      base: { app: "tmp-platform" },
    },
    destination,
  );
}

export const logger = createLogger();
export type Logger = ReturnType<typeof createLogger>;
