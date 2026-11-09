/**
 * The guided tour of the admin area. Pure data and logic (no React, no browser), so it can be unit-tested.
 *
 * The steps are built from the menu groups the signed-in person is actually allowed to see, so the tour never
 * describes an area they cannot open. The tour starts once per sign-in: the layout passes a key derived from the
 * session, and `claimTourForSession` remembers (in the browser) that this session has already had it.
 */

export type TourGroup = { title: string; links: { href: string; label: string }[] };

export type TourStep = {
  id: string;
  title: string;
  body: string;
  /** Extra line shown only where the menu is hidden behind a button (phones and tablets). */
  compactHint?: string;
  /** Short explanations of each area in a group. */
  items?: { label: string; text: string }[];
  /** Value of the `data-tour` attribute of the element to point at. Steps without one are shown in the middle. */
  target?: string;
};

export const TOUR_TARGET_NAV = "nav";
export const TOUR_TARGET_ACCOUNT = "account";
export const TOUR_TARGET_REPLAY = "replay";
/** Fired on `window` to start the tour again from the beginning. */
export const TOUR_START_EVENT = "tmp-admin-tour:start";

/** The `data-tour` value of a menu group; used by both the menu and the steps so they cannot drift apart. */
export const tourGroupTarget = (title: string): string =>
  `group-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

const AREA_TEXT: Record<string, string> = {
  "/admin": "Your home page: warnings to fix, what needs your attention, and recent activity.",
  "/admin/users": "Everyone with an account. Give or take away roles, and suspend or restore accounts.",
  "/admin/tutors": "Review tutor applications and choose what the public sees on each tutor profile.",
  "/admin/banners": "The pictures and messages in the home page slideshow.",
  "/admin/content": "The wording of every public page, the policies, and the business details such as phone and Mobile Money number.",
  "/admin/images": "The pictures used around the site: logo, service cards, Kaitlyn's picture and more.",
  "/admin/media": "Every uploaded picture in one place. Replace a picture once and it changes everywhere it is used.",
  "/admin/assistant": "Kaitlyn, the website assistant: check that she works, add notes she should know, or switch her off.",
  "/admin/shop": "TMP's own resources. Add one with its PDF and publish it. Paid ones unlock when you confirm payment under Orders.",
  "/admin/review": "Resources submitted by creators. Read, score, then approve, ask for changes or decline.",
  "/admin/creators": "What each creator is owed, and where you record a payout once you have paid them.",
  "/admin/orders": "Match each Mobile Money payment to its reference, mark it paid, and the buyer's download unlocks.",
  "/admin/audit": "A record of who changed what and when. Entries cannot be edited or deleted.",
};

const GROUP_INTRO: Record<string, string> = {
  Overview: "Start here each day.",
  People: "Who has an account, and who teaches.",
  Website: "What visitors see on the public site.",
  Marketplace: "Resources, creators and money.",
  System: "Records kept for accountability.",
};

export function buildTourSteps(groups: TourGroup[], firstName: string): TourStep[] {
  const name = firstName.trim();
  const steps: TourStep[] = [
    {
      id: "welcome",
      title: name ? `Welcome, ${name}` : "Welcome",
      body: "This is the TMP admin area. A one-minute tour shows where things are. It appears each time you sign in. You can skip it now, and bring it back whenever you like with “Take the tour” in the menu.",
    },
    {
      id: "menu",
      title: "Your menu",
      body: "Everything you can do is listed here. You only see the areas your role allows, so a colleague with a different role may see more or less.",
      compactHint: "On a phone or tablet, tap Menu at the top of the screen to open it.",
      target: TOUR_TARGET_NAV,
    },
  ];
  for (const g of groups) {
    steps.push({
      id: tourGroupTarget(g.title),
      title: g.title,
      body: GROUP_INTRO[g.title] ?? "",
      items: g.links.map((l) => ({ label: l.label, text: AREA_TEXT[l.href] ?? "" })).filter((i) => i.text),
      target: tourGroupTarget(g.title),
    });
  }
  steps.push(
    {
      id: "account",
      title: "View website and Sign out",
      body: "“View website” takes you to the public site so you can see your changes. Sign out when you have finished, and always on a shared computer.",
      target: TOUR_TARGET_ACCOUNT,
    },
    {
      id: "done",
      title: "You are ready",
      body: "On the Dashboard, “Needs your attention” tells you what to do next. Every change you make here is recorded. You can run this tour again at any time.",
    },
  );
  return steps;
}

// ---- Once per sign-in ------------------------------------------------------------------------------------------

const KEY_PREFIX = "tmp-admin-tour:";

/** The small part of the browser's storage interface used here, so tests can pass a plain object. */
export type TourStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
};

/**
 * Returns true the first time it is called for a sign-in (and remembers that), false afterwards, so a reload or a
 * move to another admin page does not start the tour again. A new sign-in has a new key, so it starts again.
 * Keys of earlier sign-ins are removed to keep storage tidy. If storage is unavailable it returns true: the tour
 * lives in the shared admin layout, which stays mounted while moving between admin pages, so it is not repeated
 * on every page; only a full reload could show it again.
 */
export function claimTourForSession(store: TourStore | null, sessionKey: string): boolean {
  if (!store) return true;
  try {
    const mine = KEY_PREFIX + sessionKey;
    if (store.getItem(mine)) return false;
    const stale: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(KEY_PREFIX)) stale.push(k);
    }
    for (const k of stale) store.removeItem(k);
    store.setItem(mine, "1");
    return true;
  } catch {
    return true;
  }
}
