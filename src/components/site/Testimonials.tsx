"use client";

import type { Testimonial } from "@/lib/testimonials";
import { SiteIcon } from "./Brand";
import { useAutoplay } from "./useAutoplay";

const initials = (name: string) =>
  name
    .split(/[,\s]+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "T";

/** A looping, self-advancing quote card with arrows and dots. Pauses under the mouse and has a Pause button. */
export function Testimonials({ items, seconds = 7, children }: { items: Testimonial[]; seconds?: number; children?: React.ReactNode }) {
  const { index, go, next, prev, playing, userPaused, toggle, hoverProps } = useAutoplay(items.length, seconds * 1000);
  if (items.length === 0) return null;
  return (
    <div aria-roledescription="carousel" aria-label="Testimonials" className="relative" {...hoverProps}>
      <div className="relative rounded-3xl border border-navy/10 bg-white p-7 shadow-[0_24px_60px_-30px_rgb(10_26_85/0.35)] md:p-9">
        <SiteIcon name="quote" className="absolute right-6 top-6 h-10 w-10 text-gold/60" stroke={1.4} />
        <div className="grid" aria-live={playing ? "off" : "polite"}>
          {items.map((t, i) => (
            <figure
              key={`${i}-${t.by}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${items.length}`}
              aria-hidden={i !== index}
              className={`slide-in col-start-1 row-start-1 flex flex-col justify-center ${i === index ? "is-active" : "pointer-events-none"}`}
            >
              <blockquote style={{ "--i": 0 } as React.CSSProperties} className="pr-8 font-display text-xl leading-snug md:text-2xl">
                “{t.quote}”
              </blockquote>
              <figcaption style={{ "--i": 1 } as React.CSSProperties} className="mt-6 flex items-center gap-3">
                <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full bg-royal font-semibold text-cream">{initials(t.by)}</span>
                <span className="text-sm font-semibold">{t.by}</span>
              </figcaption>
            </figure>
          ))}
        </div>
        {items.length > 1 ? (
          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-navy/10 pt-5">
            <ul className="flex items-center gap-2" aria-label="Choose a quote">
              {items.map((t, i) => (
                <li key={`${i}-${t.by}`}>
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-label={`Show quote ${i + 1}`}
                    aria-current={i === index}
                    className={`h-2.5 rounded-full transition-all ${i === index ? "w-8 bg-royal" : "w-2.5 bg-navy/20 hover:bg-navy/40"}`}
                  />
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <button type="button" onClick={prev} aria-label="Previous quote" className="grid h-9 w-9 place-items-center rounded-full border border-navy/20 hover:border-royal hover:text-royal"><SiteIcon name="left" className="h-4 w-4" stroke={2.2} /></button>
              <button type="button" onClick={next} aria-label="Next quote" className="grid h-9 w-9 place-items-center rounded-full border border-navy/20 hover:border-royal hover:text-royal"><SiteIcon name="right" className="h-4 w-4" stroke={2.2} /></button>
              <button type="button" onClick={toggle} aria-pressed={userPaused} className="ml-1 text-sm underline decoration-gold underline-offset-4">
                {userPaused ? "Play" : "Pause"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
