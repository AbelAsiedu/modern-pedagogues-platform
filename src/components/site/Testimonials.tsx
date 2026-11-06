"use client";

import type { Testimonial } from "@/lib/testimonials";
import { useAutoplay } from "./useAutoplay";

/** A looping, self-advancing quote rotator. Pauses under the mouse and has a Pause button. */
export function Testimonials({ items, heading, seconds = 7 }: { items: Testimonial[]; heading: string; seconds?: number }) {
  const { index, go, playing, userPaused, toggle, hoverProps } = useAutoplay(items.length, seconds * 1000);
  if (items.length === 0) return null;
  return (
    <section aria-roledescription="carousel" aria-label={heading} className="relative overflow-hidden bg-navy text-cream" {...hoverProps}>
      <div className="blob -right-20 top-0 h-72 w-72 bg-gold/50" aria-hidden="true" />
      <div className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-gold">{heading}</h2>
        <div className="mt-8 grid" aria-live={playing ? "off" : "polite"}>
          {items.map((t, i) => (
            <figure
              key={`${i}-${t.by}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${items.length}`}
              aria-hidden={i !== index}
              className={`slide-in col-start-1 row-start-1 flex flex-col items-center justify-center ${i === index ? "is-active" : "pointer-events-none"}`}
            >
              <blockquote style={{ "--i": 0 } as React.CSSProperties} className="text-2xl font-medium leading-snug md:text-3xl">
                <span className="gradient-text mr-1 text-5xl leading-none" aria-hidden="true">“</span>
                {t.quote}
              </blockquote>
              <figcaption style={{ "--i": 1 } as React.CSSProperties} className="mt-6 text-sm text-cream/70">{t.by}</figcaption>
            </figure>
          ))}
        </div>
        {items.length > 1 ? (
          <div className="mt-8 flex items-center justify-center gap-4">
            <ul className="flex gap-2" aria-label="Choose a quote">
              {items.map((t, i) => (
                <li key={`${i}-${t.by}`}>
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-label={`Show quote ${i + 1}`}
                    aria-current={i === index}
                    className={`h-2.5 rounded-full transition-all ${i === index ? "w-8 bg-gold" : "w-2.5 bg-cream/30 hover:bg-cream/60"}`}
                  />
                </li>
              ))}
            </ul>
            <button type="button" onClick={toggle} aria-pressed={userPaused} className="text-sm underline decoration-gold underline-offset-4">
              {userPaused ? "Play" : "Pause"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
