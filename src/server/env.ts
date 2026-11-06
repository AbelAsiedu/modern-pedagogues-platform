import { z } from "zod";

/**
 * Environment validation. Every variable the server reads is declared here, parsed once, and typed.
 * In production the app refuses to start with missing or unsafe values (no fallback secrets).
 */
const boolish = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url(),
    DATABASE_URL: z.string().min(1),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_SSL: boolish.default(false),
    /** Heroku Postgres presents a certificate chain Node cannot verify; set to false there only. */
    DATABASE_SSL_REJECT_UNAUTHORIZED: boolish.default(true),
    EMAIL_PROVIDER: z.enum(["console", "smtp"]).default("console"),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
    /** true = implicit TLS (port 465). false = STARTTLS (port 587). */
    SMTP_SECURE: boolish.default(true),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).default("The Modern Pedagogues <no-reply@localhost>"),
    /** Kaitlyn AI assistant. Optional: with no key set the assistant is switched off and the site works without it. */
    GEMINI_API_KEY: z.string().min(1).optional(),
    GOOGLE_API_KEY: z.string().min(1).optional(),
    GEMINI_MODEL: z.string().min(1).default("gemini-3.6-flash"),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    OPENROUTER_MODEL: z.string().min(1).default("openrouter/free"),
    MISTRAL_API_KEY: z.string().min(1).optional(),
    MISTRAL_MODEL: z.string().min(1).default("mistral-small-latest"),
    /** Hard ceiling on Kaitlyn replies per day across all visitors (cost control). */
    ASSISTANT_DAILY_LIMIT: z.coerce.number().int().min(1).max(100_000).default(1000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  })
  .superRefine((v, ctx) => {
    if (v.EMAIL_PROVIDER === "smtp") {
      for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"] as const) {
        if (!v[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when EMAIL_PROVIDER=smtp` });
      }
    }
    if (v.NODE_ENV === "production") {
      if (!v.APP_URL.startsWith("https://")) {
        ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "APP_URL must use https in production" });
      }
      if (v.EMAIL_PROVIDER === "console") {
        ctx.addIssue({
          code: "custom",
          path: ["EMAIL_PROVIDER"],
          message: "EMAIL_PROVIDER=console only logs messages; configure a real provider for production",
        });
      }
    }
  });

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n - ${issues.join("\n - ")}`);
    this.name = "EnvError";
  }
}

/** Parse a given source (testable). Throws EnvError listing every problem at once. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvError(result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
  }
  return result.data;
}

let cached: Env | undefined;
export function env(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}
