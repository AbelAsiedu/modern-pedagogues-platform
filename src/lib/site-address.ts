/**
 * Email links (confirm your email, reset your password, order notices) are built from the APP_URL setting.
 * If APP_URL is not the address people really use, those links go to a page that does not exist.
 * This compares the two so the admin dashboard can say so.
 */
export type AddressCheck = { ok: true } | { ok: false; configured: string; actual: string; command: string };

const isLocal = (host: string) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);

export function checkSiteAddress(appUrl: string, requestHost: string | null | undefined, appName = "themodernpedagogues"): AddressCheck {
  if (!requestHost) return { ok: true };
  let configured: string;
  try {
    configured = new URL(appUrl).host.toLowerCase();
  } catch {
    return { ok: true };
  }
  const actual = requestHost.trim().toLowerCase();
  if (configured === actual || isLocal(actual)) return { ok: true };
  return {
    ok: false,
    configured,
    actual,
    command: `heroku config:set APP_URL=https://${actual} -a ${appName}`,
  };
}
