/**
 * Typed application errors. `message` is for logs and may contain detail; `publicMessage`
 * is the only text ever shown to a user, and is deliberately generic where leaking detail
 * (for example whether an email is registered) would help an attacker.
 */
export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_VERIFIED"
  | "ACCOUNT_LOCKED"
  | "ACCOUNT_SUSPENDED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INVALID_TOKEN"
  | "MFA_REQUIRED"
  | "INVALID_CODE"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly httpStatus: number,
    public readonly publicMessage: string,
    message?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message ?? publicMessage);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(public readonly fieldErrors: Record<string, string[]>, message = "Validation failed") {
    super("VALIDATION", 400, "Please check the highlighted fields.", message, { fieldErrors });
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Not signed in") {
    super("UNAUTHENTICATED", 401, "Please sign in to continue.", message);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super("INVALID_CREDENTIALS", 401, "Incorrect email or password.");
  }
}

export class EmailNotVerifiedError extends AppError {
  constructor() {
    super("EMAIL_NOT_VERIFIED", 403, "Please confirm your email address before signing in. Check your inbox (and spam) for the link, or use “Send it again” below the form.");
  }
}

export class AccountLockedError extends AppError {
  constructor(public readonly retryAfterSeconds: number) {
    super("ACCOUNT_LOCKED", 429, "Too many attempts. Please try again later.", undefined, { retryAfterSeconds });
  }
}

export class AccountSuspendedError extends AppError {
  constructor() {
    super("ACCOUNT_SUSPENDED", 403, "This account has been suspended. Please contact The Modern Pedagogues.");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super("FORBIDDEN", 403, "You do not have permission to do that.", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super("NOT_FOUND", 404, "We could not find what you were looking for.", message);
  }
}

export class ConflictError extends AppError {
  constructor(publicMessage: string, message?: string) {
    super("CONFLICT", 409, publicMessage, message);
  }
}

export class RateLimitError extends AppError {
  constructor(public readonly retryAfterSeconds: number) {
    super("RATE_LIMITED", 429, "Too many requests. Please try again shortly.", undefined, { retryAfterSeconds });
  }
}

export class InvalidTokenError extends AppError {
  constructor() {
    super("INVALID_TOKEN", 400, "This link is invalid or has expired. Please request a new one.");
  }
}

/**
 * Thrown by login() when the password was right but the account has two-step sign-in switched on. It carries the
 * single-use challenge the second step presents; the challenge is a property, never part of the public message.
 * Because login() throws instead of returning a session, an account with two-step sign-in can never get a session
 * from the password alone.
 */
export class MfaRequiredError extends AppError {
  constructor(public readonly challenge: string) {
    super("MFA_REQUIRED", 401, "Enter the code from your authenticator app to finish signing in.");
  }
}

/** A wrong, reused or expired second-step code. One message for all of them. */
export class InvalidCodeError extends AppError {
  constructor(message = "That code did not work. Check the 6 digits in your app (they change every 30 seconds) or use a recovery code.") {
    super("INVALID_CODE", 401, message);
  }
}

/** Shape returned to clients. Never includes stack traces or internal messages. */
export type ErrorResponse = {
  ok: false;
  error: { code: ErrorCode; message: string; fieldErrors?: Record<string, string[]>; retryAfterSeconds?: number };
};

export function toErrorResponse(err: unknown): { status: number; body: ErrorResponse } {
  if (err instanceof AppError) {
    const fieldErrors = err instanceof ValidationError ? err.fieldErrors : undefined;
    const retry = err instanceof RateLimitError || err instanceof AccountLockedError ? err.retryAfterSeconds : undefined;
    return {
      status: err.httpStatus,
      body: {
        ok: false,
        error: {
          code: err.code,
          message: err.publicMessage,
          ...(fieldErrors ? { fieldErrors } : {}),
          ...(retry !== undefined ? { retryAfterSeconds: retry } : {}),
        },
      },
    };
  }
  return {
    status: 500,
    body: { ok: false, error: { code: "INTERNAL", message: "Something went wrong on our side. Please try again." } },
  };
}
