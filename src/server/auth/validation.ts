import { z } from "zod";
import { ValidationError } from "../errors";
import { passwordSchema } from "./password";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254));

export const REGISTRATION_ROLES = ["student", "parent"] as const;

export const registerSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  password: passwordSchema,
  /** Only low-privilege self-service roles can be requested at sign-up. */
  role: z.enum(REGISTRATION_ROLES),
});
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(256),
});

export const tokenSchema = z.string().min(20).max(200);

/** Parse with a Zod schema, converting failures into the app's ValidationError. */
export function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fieldErrors = z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>;
    const clean: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(fieldErrors)) if (v) clean[k] = v;
    throw new ValidationError(clean);
  }
  return result.data;
}
