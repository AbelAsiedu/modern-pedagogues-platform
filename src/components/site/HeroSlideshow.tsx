"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { SiteIcon, Wave } from "./Brand";
import { useAutoplay } from "./useAutoplay";

export type Slide = {
  id: string;
  title: string;
  subtitle: string | null;
  imagePath: string;
  imageAlt: string;
  buttonText: string | null;
  buttonUrl: string | null;
};

function SlideLink({ href, children }: { href: string; children: React.ReactNode }) {
  const cls = "pulse-ring inline-flex items-center gap-2 rounded-full bg-gold px-7 py-3.5 font-semibold text-navy shadow-lg shadow-black/25 transition-transform hover:scale-[1.04] hover:bg-[#ffd04a]";
  const inner = (
    <>
      {children}
      <SiteIcon name="arrow" className="h-4 w-4" stroke={2.2} />
    </>
  );
  return href.startsWith("/") ? <Link href={href} className={cls}>{inner}</Link> : <a href={href} className={cls}>{inner}</a>;
}

/**
 * The home page's looping slideshow: slide photo across the whole banner under a translucent blue layer, headline on the left, a curved
 * edge into the page. It starts by itself, advances every `seconds` and starts over after the last slide. A mouse resting
 * on it pauses it; there is always a visible Pause button, arrow keys work, and touch devices can swipe. Visitors who
 * prefer reduced motion get the same slides without the movement. Only the current slide is exposed to screen readers.
 */
export function HeroSlideshow({ slides, seconds = 6, kicker, searchHint }: { slides: Slide[]; seconds?: number; kicker?: string; searchHint?: string }) {
  const count = slides.length;
  const intervalMs = Math.min(20, Math.max(3, seconds)) * 1000;
  const { index, go, next, prev, playing, userPaused, toggle, hoverProps } = useAutoplay(count, intervalMs);
  const startX = useRef<number | null>(null);
  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      className="mesh relative isolate overflow-hidden text-cream"
      {...hoverProps}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") next();
        if (e.key === "ArrowLeft") prev();
      }}
      onTouchStart={(e) => {
        startX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const endX = e.changedTouches[0]?.clientX;
        const from = startX.current;
        if (from !== null && endX !== undefined && Math.abs(endX - from) > 50) (endX < from ? next : prev)();
        startX.current = null;
      }}
    >
      <div className="grid-fade absolute inset-0 -z-10" aria-hidden="true" />

      {/* Pictures fill the whole banner; a translucent blue layer keeps the text readable. */}
      <div className="absolute inset-0 -z-20 overflow-hidden">
        {slides.map((s, i) => (
          <Image
            key={s.id}
            src={s.imagePath}
            alt={i === index ? s.imageAlt : ""}
            aria-hidden={i !== index}
            fill
            unoptimized
            priority={i === 0}
            sizes="100vw"
            className={`kb-img object-cover ${i === index ? "is-active" : ""}`}
          />
        ))}
      </div>
      <div className="hero-overlay absolute inset-0 -z-10" aria-hidden="true" />

      <div className="mx-auto max-w-6xl px-6 pb-24 pt-10 md:pb-28 md:pt-16">
        <div className="md:w-[62%]">
          <div className="grid md:min-h-[21rem]" aria-live={playing ? "off" : "polite"}>
            {slides.map((s, i) => {
              const active = i === index;
              return (
                <div
                  key={s.id}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${count}`}
                  aria-hidden={!active}
                  className={`slide-in col-start-1 row-start-1 flex flex-col justify-center ${active ? "is-active" : "pointer-events-none"}`}
                  {...(!active ? { inert: true } : {})}
                >
                  {kicker ? (
                    <p style={{ "--i": 0 } as React.CSSProperties} className="text-xs font-bold uppercase tracking-[0.26em] text-gold">{kicker}</p>
                  ) : null}
                  <h2 style={{ "--i": 1 } as React.CSSProperties} className="mt-4 text-4xl font-semibold leading-[1.08] tracking-tight md:text-[3.4rem]">
                    {s.title}
                  </h2>
                  {s.subtitle ? (
                    <p style={{ "--i": 2 } as React.CSSProperties} className="mt-5 max-w-lg text-lg leading-8 text-cream/85">{s.subtitle}</p>
                  ) : null}
                  {s.buttonText && s.buttonUrl ? (
                    <div style={{ "--i": 3 } as React.CSSProperties} className="mt-7">
                      <SlideLink href={s.buttonUrl}>{s.buttonText}</SlideLink>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {searchHint ? (
            <form action="/resources" method="get" role="search" className="mt-8 flex max-w-md items-center rounded-full bg-cream p-1.5 pl-5 text-navy shadow-xl shadow-black/25">
              <label htmlFor="hero-search" className="sr-only">Search resources</label>
              <input id="hero-search" name="q" type="search" maxLength={80} placeholder={searchHint} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-navy/50" />
              <button type="submit" aria-label="Search" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold text-navy transition-transform hover:scale-105">
                <SiteIcon name="search" className="h-5 w-5" stroke={2} />
              </button>
            </form>
          ) : null}

          {count > 1 ? (
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <ol className="flex items-center gap-2" aria-label="Choose a slide">
                {slides.map((s, i) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => go(i)}
                      aria-label={`Go to slide ${i + 1}: ${s.title}`}
                      aria-current={i === index}
                      className="group block py-3"
                    >
                      <span className={`block h-2.5 overflow-hidden rounded-full transition-all ${i === index ? "w-10 bg-cream/30" : "w-2.5 bg-cream/40 group-hover:bg-cream/70"}`}>
                        {i === index ? (
                          <span
                            key={`${index}-${intervalMs}`}
                            className="progress-fill block h-full w-full rounded-full bg-gold"
                            data-paused={!playing}
                            style={{ "--dur": `${intervalMs}ms` } as React.CSSProperties}
                          />
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="flex items-center gap-2">
                <button type="button" onClick={prev} aria-label="Previous slide" className="glass-dark grid h-9 w-9 place-items-center rounded-full hover:bg-cream/20"><SiteIcon name="left" className="h-4 w-4" stroke={2.2} /></button>
                <button type="button" onClick={next} aria-label="Next slide" className="glass-dark grid h-9 w-9 place-items-center rounded-full hover:bg-cream/20"><SiteIcon name="right" className="h-4 w-4" stroke={2.2} /></button>
                <button
                  type="button"
                  onClick={toggle}
                  aria-pressed={userPaused}
                  className="glass-dark inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium hover:bg-cream/20"
                >
                  <SiteIcon name={userPaused ? "play" : "pause"} className="h-3.5 w-3.5" stroke={2.4} />
                  {userPaused ? "Play slideshow" : "Pause slideshow"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <Wave />
    </section>
  );
}
