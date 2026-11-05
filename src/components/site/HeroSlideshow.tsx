"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export type Slide = {
  id: string;
  title: string;
  subtitle: string | null;
  imagePath: string;
  imageAlt: string;
  buttonText: string | null;
  buttonUrl: string | null;
};

const INTERVAL_MS = 7000;

function SlideLink({ href, children }: { href: string; children: React.ReactNode }) {
  const cls = "inline-block rounded-full bg-gold px-6 py-3 font-semibold text-navy hover:bg-gold/90";
  return href.startsWith("/") ? <Link href={href} className={cls}>{children}</Link> : <a href={href} className={cls}>{children}</a>;
}

/**
 * Accessible auto-advancing hero. Pauses on hover and keyboard focus, stops entirely for visitors who
 * prefer reduced motion, and can be paused/advanced with visible controls. Only the active slide is exposed to screen readers.
 */
export function HeroSlideshow({ slides, children }: { slides: Slide[]; children?: React.ReactNode }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const count = slides.length;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused || userPaused || reduced) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => clearInterval(t);
  }, [count, paused, userPaused, reduced]);

  if (count === 0) return null;
  const safeIndex = Math.min(index, count - 1);

  return (
    <section
      ref={rootRef}
      aria-roledescription="carousel"
      aria-label="Featured"
      className="bg-navy text-cream"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(safeIndex + 1);
        if (e.key === "ArrowLeft") go(safeIndex - 1);
      }}
    >
      <div className="mx-auto max-w-6xl px-6 py-14 md:py-20">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div className="relative min-h-[17rem]" aria-live={paused || userPaused || reduced ? "polite" : "off"}>
            {slides.map((s, i) => (
              <div
                key={s.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${count}`}
                aria-hidden={i !== safeIndex}
                className={`${i === safeIndex ? "relative opacity-100" : "pointer-events-none absolute inset-0 opacity-0"} transition-opacity duration-700 motion-reduce:transition-none`}
              >
                <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">{s.title}</h2>
                {s.subtitle ? <p className="mt-5 max-w-xl text-lg text-cream/85">{s.subtitle}</p> : null}
                {s.buttonText && s.buttonUrl ? (
                  <div className="mt-8" {...(i !== safeIndex ? { inert: true } : {})}>
                    <SlideLink href={s.buttonUrl}>{s.buttonText}</SlideLink>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-navy/60 ring-1 ring-cream/15">
            {slides.map((s, i) => (
              <Image
                key={s.id}
                src={s.imagePath}
                alt={i === safeIndex ? s.imageAlt : ""}
                aria-hidden={i !== safeIndex}
                fill
                unoptimized
                priority={i === 0}
                sizes="(min-width: 768px) 50vw, 100vw"
                className={`object-cover transition-opacity duration-700 motion-reduce:transition-none ${i === safeIndex ? "opacity-100" : "opacity-0"}`}
              />
            ))}
          </div>
        </div>

        {count > 1 ? (
          <div className="mt-8 flex items-center gap-4">
            <button type="button" onClick={() => go(safeIndex - 1)} aria-label="Previous slide" className="rounded-full border border-cream/40 px-3 py-1 hover:border-cream">‹</button>
            <ul className="flex gap-2" aria-label="Choose a slide">
              {slides.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-label={`Go to slide ${i + 1}`}
                    aria-current={i === safeIndex}
                    className={`h-2.5 w-8 rounded-full ${i === safeIndex ? "bg-gold" : "bg-cream/30 hover:bg-cream/60"}`}
                  />
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => go(safeIndex + 1)} aria-label="Next slide" className="rounded-full border border-cream/40 px-3 py-1 hover:border-cream">›</button>
            {!reduced ? (
              <button type="button" onClick={() => setUserPaused((p) => !p)} className="ml-2 text-sm underline decoration-gold underline-offset-4">
                {userPaused ? "Play slideshow" : "Pause slideshow"}
              </button>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}
