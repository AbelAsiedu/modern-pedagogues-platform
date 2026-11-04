/**
 * Runs once when the server starts. Validating the environment here makes a misconfigured
 * production deployment crash immediately, with the reason in the platform's logs, instead of
 * serving error pages while every database or email feature quietly breaks.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { validateEnvironmentOrCrash } = await import("./instrumentation-node");
  validateEnvironmentOrCrash();
}
