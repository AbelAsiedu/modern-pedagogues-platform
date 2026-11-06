"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** The phone-size menu. Closes itself when the visitor goes to another page. */
export function MobileMenu({ links, cta }: { links: { href: string; label: string }[]; cta: { href: string; label: string } }) {
  const pathname = usePathname();
  // The menu is open for the page it was opened on, so going to another page closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenOn((cur) => ((typeof v === "function" ? v(cur === pathname) : v) ? pathname : null));
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-navy/25 px-4 text-sm font-medium"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} />
        </svg>
        Menu
      </button>
      {open ? (
        <nav id="mobile-menu" aria-label="Main" className="absolute inset-x-0 top-full border-b border-navy/10 bg-cream/95 px-6 pb-6 pt-2 shadow-xl backdrop-blur-xl">
          <ul className="divide-y divide-navy/10">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="block py-3.5 text-lg font-medium">{l.label}</Link>
              </li>
            ))}
          </ul>
          <a href={cta.href} className="mt-4 block rounded-full bg-navy px-5 py-3 text-center font-semibold text-cream">{cta.label}</a>
        </nav>
      ) : null}
    </div>
  );
}
