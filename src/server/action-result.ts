import { toErrorResponse } from "./errors";
import { logger } from "./logger";

export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

/** Run an action body, converting thrown app errors into form-friendly state. Unexpected errors are logged, not shown. */
export async function runAction(body: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await body()) ?? { ok: true };
  } catch (err) {
    // redirect() and notFound() work by throwing; let Next.js handle them.
    if (typeof err === "object" && err !== null && "digest" in err && typeof (err as { digest: unknown }).digest === "string") {
      const d = (err as { digest: string }).digest;
      if (d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_HTTP_ERROR_FALLBACK") || d === "NEXT_NOT_FOUND") throw err;
    }
    const { body: b, status } = toErrorResponse(err);
    if (status >= 500) logger.error({ err }, "unexpected action error");
    return { ok: false, error: b.error.message, fieldErrors: b.error.fieldErrors };
  }
}
