/** Logo, curved dividers and the small icon set used across the public site. */

/** "The Modern Pedagogues" -> "TMP". Initials of every word, at most four. */
export const acronym = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 4) || "TMP";

/** Two balanced lines for the small text beside the monogram: "THE MODERN" / "PEDAGOGUES". */
function twoLines(name: string): [string, string] {
  const words = name.toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [words[0] ?? "", ""];
  let best = 1;
  let diff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (d < diff) {
      diff = d;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/**
 * The wordmark, laid out like the TMP lockup: the interlocking "tmp" lettering (public/images/tmp-mark.svg, traced from
 * the supplied logo), a thin divider, then the business name on two lines. If the administrator uploads a logo
 * (Site images), that picture is used instead. For any other business name the lettering is plain bold initials.
 * Built for dark blue backgrounds.
 */
export function Logo({ name, imagePath, className = "" }: { name: string; imagePath?: string; className?: string }) {
  if (imagePath) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imagePath} alt={name} className={`h-10 w-auto max-w-[14rem] object-contain ${className}`} />;
  }
  const [a, b] = twoLines(name);
  const isTmp = acronym(name) === "TMP";
  return (
    <span className={`inline-flex items-center gap-3 ${className}`} aria-label={name}>
      {isTmp ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/images/tmp-mark.svg" alt="" aria-hidden="true" width={86} height={50} className="h-[2.55rem] w-auto shrink-0" />
      ) : (
        <span aria-hidden="true" className="text-[1.9rem] font-black leading-none tracking-tighter text-gold">{acronym(name)}</span>
      )}
      <span aria-hidden="true" className="h-9 w-px shrink-0 bg-gold/80" />
      <span aria-hidden="true" className="text-[0.7rem] font-extrabold leading-[1.15] tracking-[0.06em] text-cream">
        {a}
        {b ? <><br />{b}</> : null}
      </span>
    </span>
  );
}

/** A curved edge that sits on the bottom of a blue section and flows into the white page, with a yellow swoosh. */
export function Wave({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1440 96" preserveAspectRatio="none" aria-hidden="true" className={`pointer-events-none absolute inset-x-0 bottom-[-1px] h-10 w-full md:h-16 ${className}`}>
      <path d="M0 58 C 200 8, 420 8, 700 46 S 1180 96, 1440 36" fill="none" stroke="#ffc20e" strokeWidth="5" strokeLinecap="round" />
      <path d="M0 66 C 220 20, 440 24, 720 58 S 1190 100, 1440 50 V96 H0Z" fill="#ffffff" />
    </svg>
  );
}

const ICONS = {
  cap: "M12 4L2 9l10 5 10-5-10-5zM6 11.5V16c1.6 1.4 3.6 2 6 2s4.4-.6 6-2v-4.5M22 9v6",
  users: "M16 20v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 18.5V20M10 12a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM20 20v-1.5a3.5 3.5 0 00-2.5-3.35M15.5 5.15a3.5 3.5 0 010 6.7",
  book: "M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5zM4 20.5A2.5 2.5 0 006.5 23H20v-2",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  school: "M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6M12 3v2",
  award: "M12 15a6 6 0 100-12 6 6 0 000 12zM8.5 14l-1.5 7 5-3 5 3-1.5-7",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  arrow: "M5 12h14M13 6l6 6-6 6",
  quote: "M7 7h4v4H8c0 2 .8 3 3 3v3c-3.5 0-5-2-5-5zM15 7h4v4h-3c0 2 .8 3 3 3v3c-3.5 0-5-2-5-5z",
  mail: "M3 6h18v12H3zM3 7l9 7 9-7",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  pause: "M8 5v14M16 5v14",
  play: "M7 5l12 7-12 7z",
  left: "M15 5l-7 7 7 7",
  right: "M9 5l7 7-7 7",
} as const;
export type SiteIconName = keyof typeof ICONS;

export function SiteIcon({ name, className = "h-6 w-6", stroke = 1.7 }: { name: SiteIconName; className?: string; stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={ICONS[name]} />
    </svg>
  );
}

/** Round, outlined social icons. Only shown for the links an administrator has filled in. */
export function SocialIcon({ kind, className = "h-4 w-4" }: { kind: "facebook" | "instagram" | "x" | "youtube" | "linkedin" | "tiktok"; className?: string }) {
  const common = { viewBox: "0 0 24 24", className, "aria-hidden": true as const, fill: "currentColor" };
  switch (kind) {
    case "facebook":
      return <svg {...common}><path d="M13.5 21v-8h2.7l.4-3.2h-3.1V7.8c0-.9.3-1.5 1.6-1.5h1.7V3.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.4H7.6V13h2.8v8z" /></svg>;
    case "instagram":
      return <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" /></svg>;
    case "x":
      return <svg {...common}><path d="M17.8 3h3l-6.6 7.6L22 21h-6.1l-4.8-6.2L5.6 21h-3l7.1-8.1L2.2 3h6.2l4.3 5.7zm-1 16.2h1.7L7.5 4.7H5.7z" /></svg>;
    case "youtube":
      return <svg {...common}><path d="M21.6 7.2a2.5 2.5 0 00-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 002.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 001.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 001.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3z" /></svg>;
    case "linkedin":
      return <svg {...common}><path d="M4.5 9h3.3v10.5H4.5zM6.2 3.8a1.9 1.9 0 110 3.8 1.9 1.9 0 010-3.8zM10 9h3.1v1.4c.5-.9 1.6-1.7 3.3-1.7 3.2 0 3.8 2.1 3.8 4.9v6h-3.3v-5.3c0-1.3 0-2.9-1.8-2.9s-2 1.4-2 2.8v5.4H10z" /></svg>;
    case "tiktok":
      return <svg {...common}><path d="M16.5 3c.3 2.3 1.7 3.8 4 4v3.2c-1.5 0-2.8-.5-4-1.3v6.2a5.6 5.6 0 11-5.6-5.6c.3 0 .6 0 .9.1v3.3a2.4 2.4 0 102 2.4V3z" /></svg>;
  }
}
