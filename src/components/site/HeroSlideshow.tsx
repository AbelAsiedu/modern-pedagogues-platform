"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
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
  const cls = "pulse-ring inline-flex items-center gap-2 rounded-full bg-gold px-7 py-3.5 font-semibold text-navy transition-transform hover:scale-[1.03] hover:bg-[#d8a94d]";
  const inner = (
    <>
      {children}
      <span aria-hidden="true">→</span>
    </>
  );
  return href.startsWith("/") ? <Link href={href} className={cls}>{inner}</Link> : <a href={href} className={cls}>{inner}</a>;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The home page's looping slideshow. It starts by itself, advances every `seconds` and starts over after the
 * last slide. A mouse resting on it pauses it; there is always a visible Pause button, arrow keys work, and
 * touch devices can swipe. Visitors who prefer reduced motion get the same slides without the movement.
 * Only the current slide is exposed to screen readers.
 */
export function HeroSlideshow({ slides, seconds = 6, kicker }: { slides: Slide[]; seconds?: number; kicker?: string }) {
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
      <div className="blob -left-24 top-10 h-72 w-72 bg-gold/60" aria-hidden="true" />
      <div className="blob -bottom-24 right-10 h-80 w-80 bg-sky-500/40 [animation-delay:-6s]" aria-hidden="true" />
      <div className="grid-fade absolute inset-0 -z-10" aria-hidden="true" />

      <div className="mx-auto max-w-6xl px-6 pb-10 pt-12 md:pb-14 md:pt-20">
        <div className="grid items-center gap-10 md:grid-cols-[1.05fr_1fr] md:gap-14">
          {/* Text: every slide sits in the same grid cell so the section never changes height. */}
          <div className="grid" aria-live={playing ? "off" : "polite"}>
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
                  <p style={{ "--i": 0 } as React.CSSProperties} className="text-xs font-semibold uppercase tracking-[0.22em] text-gold">
                    {kicker ? `${kicker} · ` : ""}{pad(i + 1)} / {pad(count)}
                  </p>
                  <h2 style={{ "--i": 1 } as React.CSSProperties} className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
                    {s.title}
                  </h2>
                  {s.subtitle ? (
                    <p style={{ "--i": 2 } as React.CSSProperties} className="mt-5 max-w-xl text-lg leading-8 text-cream/80">{s.subtitle}</p>
                  ) : null}
                  {s.buttonText && s.buttonUrl ? (
                    <div style={{ "--i": 3 } as React.CSSProperties} className="mt-8">
                      <SlideLink href={s.buttonUrl}>{s.buttonText}</SlideLink>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Picture */}
          <div className="relative">
            <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-gold/40 via-transparent to-sky-400/30 blur-xl" aria-hidden="true" />
            <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-navy/60 ring-1 ring-cream/20 shadow-2xl shadow-black/40">
              {slides.map((s, i) => (
                <Image
                  key={s.id}
                  src={s.imagePath}
                  alt={i === index ? s.imageAlt : ""}
                  aria-hidden={i !== index}
                  fill
                  unoptimized
                  priority={i === 0}
                  sizes="(min-width: 768px) 50vw, 100vw"
                  className={`kb-img object-cover ${i === index ? "is-active" : ""}`}
                />
              ))}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-navy/40 via-transparent to-transparent" aria-hidden="true" />
            </div>
          </div>
        </div>

        {count > 1 ? (
          <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-4">
            <ol className="flex flex-1 basis-64 gap-2" aria-label="Choose a slide">
              {slides.map((s, i) => (
                <li key={s.id} className="flex-1">
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-label={`Go to slide ${i + 1}: ${s.title}`}
                    aria-current={i === index}
                    className="group block w-full py-2"
                  >
                    <span className="block h-1 overflow-hidden rounded-full bg-cream/20 group-hover:bg-cream/35">
                      {i === index ? (
                        <span
                          key={`${index}-${intervalMs}`}
                          className="progress-fill block h-full w-full rounded-full bg-gold"
                          data-paused={!playing}
                          style={{ "--dur": `${intervalMs}ms` } as React.CSSProperties}
                        />
                      ) : i < index ? (
                        <span className="block h-full w-full rounded-full bg-cream/50" />
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="flex items-center gap-2">
              <button type="button" onClick={prev} aria-label="Previous slide" className="glass-dark grid h-10 w-10 place-items-center rounded-full hover:bg-cream/20">‹</button>
              <button type="button" onClick={next} aria-label="Next slide" className="glass-dark grid h-10 w-10 place-items-center rounded-full hover:bg-cream/20">›</button>
              <button
                type="button"
                onClick={toggle}
                aria-pressed={userPaused}
                className="glass-dark ml-1 inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium hover:bg-cream/20"
              >
                <span aria-hidden="true">{userPaused ? "▶" : "❚❚"}</span>
                {userPaused ? "Play slideshow" : "Pause slideshow"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
