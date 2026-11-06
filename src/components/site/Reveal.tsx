"use client";

import { useEffect, useRef } from "react";

/**
 * Fades and lifts its children into view as the visitor scrolls. The server sends the content fully visible, so
 * nothing is hidden if scripts fail or for search engines. After the page loads, only content that is still below
 * the fold is prepared to animate. Visitors who prefer reduced motion see everything at once.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** Milliseconds to wait before this item animates, to stagger a row of cards. */
  delay?: number;
  as?: "div" | "li" | "section" | "article";
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    el.classList.add("reveal");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add("is-in");
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    const raf = requestAnimationFrame(() => io.observe(el));
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);
  const style = delay ? ({ "--d": `${delay}ms` } as React.CSSProperties) : undefined;
  // The ref type differs per tag; all four are HTMLElements.
  const Component = Tag as React.ElementType;
  return (
    <Component ref={ref} className={className} style={style}>
      {children}
    </Component>
  );
}
