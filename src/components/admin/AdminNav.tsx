"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavGroup = { title: string; links: { href: string; label: string; icon: IconName }[] };

const ICONS = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  users: "M16 20v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 18.5V20M10 12a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM20 20v-1.5a3.5 3.5 0 00-2.5-3.35M15.5 5.15a3.5 3.5 0 010 6.7",
  tutors: "M12 4L2 9l10 5 10-5-10-5zM6 11.5V16c1.6 1.4 3.6 2 6 2s4.4-.6 6-2v-4.5M22 9v6",
  slideshow: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M9 9.5h.01",
  text: "M4 7V4h16v3M9 20h6M12 4v16",
  media: "M3 8h4l1.5-2.5h7L17 8h4v11H3zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
  chat: "M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z",
  book: "M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5zM4 20.5A2.5 2.5 0 006.5 23H20v-2",
  check: "M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  pen: "M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z",
  receipt: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6",
  list: "M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01",
  external: "M14 4h6v6M20 4l-9 9M18 14v5H5V6h5",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6L6 18",
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "h-[18px] w-[18px]" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={ICONS[name]} />
    </svg>
  );
}

/** Sidebar on large screens; a menu button that opens the same list on phones and tablets. */
export function AdminNav({ groups, signOut }: { groups: NavGroup[]; signOut: React.ReactNode }) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenOn((cur) => ((typeof v === "function" ? v(cur === pathname) : v) ? pathname : null));

  const active = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-navy px-4 py-3 text-cream lg:hidden">
        <Link href="/admin" className="font-semibold tracking-tight">TMP Admin</Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="admin-sidebar"
          className="inline-flex items-center gap-2 rounded-full border border-cream/30 px-3 py-1.5 text-sm"
        >
          <Icon name={open ? "close" : "menu"} />
          Menu
        </button>
      </div>
      <aside
        id="admin-sidebar"
        className={`${open ? "block" : "hidden"} bg-navy text-cream lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-64 lg:flex-col`}
      >
        <div className="hidden px-6 pb-2 pt-7 lg:block">
          <Link href="/admin" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold font-bold text-navy">T</span>
            <span className="leading-tight">
              <span className="block font-semibold tracking-tight">TMP Admin</span>
              <span className="block text-xs text-cream/60">The Modern Pedagogues</span>
            </span>
          </Link>
        </div>
        <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map((g) => (
            <div key={g.title} className="mb-5">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cream/45">{g.title}</p>
              <ul className="space-y-0.5">
                {g.links.map((l) => {
                  const on = active(l.href);
                  return (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        aria-current={on ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${on ? "bg-cream/12 font-semibold text-gold" : "text-cream/80 hover:bg-cream/8 hover:text-cream"}`}
                      >
                        <Icon name={l.icon} />
                        {l.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="space-y-2 border-t border-cream/10 px-3 py-4">
          <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-cream/80 hover:bg-cream/8 hover:text-cream">
            <Icon name="external" />
            View website
          </Link>
          {signOut}
        </div>
      </aside>
    </>
  );
}
