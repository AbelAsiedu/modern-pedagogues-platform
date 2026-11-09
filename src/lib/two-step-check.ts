/** The command that makes a key for two-step sign-in. Works anywhere Node is installed, on Windows too. */
export const MAKE_KEY_COMMAND = `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`;

export type TwoStepNotice = { title: string; body: string; command?: string };

/**
 * What the admin dashboard should say about two-step sign-in, or null when everything is as it should be.
 * keySet: MFA_ENCRYPTION_KEY is configured. required: STAFF_MFA_REQUIRED is not switched off.
 */
export function twoStepNotice(keySet: boolean, required: boolean, appName = "themodernpedagogues"): TwoStepNotice | null {
  if (!keySet) {
    return {
      title: "Two-step sign-in is not switched on yet",
      body: `Right now a password is the only thing protecting this admin area. Make a key with the first command, copy its output, then store it with the second (replace PASTE_KEY_HERE) and keep a copy somewhere safe. After that, every staff member is asked to set up an authenticator app the next time they sign in.`,
      command: `${MAKE_KEY_COMMAND}\nheroku config:set MFA_ENCRYPTION_KEY=PASTE_KEY_HERE -a ${appName}`,
    };
  }
  if (!required) {
    return {
      title: "Staff are not required to use two-step sign-in",
      body: `The STAFF_MFA_REQUIRED setting is off, so staff can still sign in with a password alone. Turn it back on unless you are fixing an emergency.`,
      command: `heroku config:unset STAFF_MFA_REQUIRED -a ${appName}`,
    };
  }
  return null;
}
