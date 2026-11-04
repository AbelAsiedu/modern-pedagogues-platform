import { env } from "./server/env";

/** Node-only startup checks. Kept out of instrumentation.ts so the Edge bundle never sees `process.exit`. */
export function validateEnvironmentOrCrash() {
  try {
    env();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    if (process.env.NODE_ENV === "production") process.exit(1);
    throw err;
  }
}
