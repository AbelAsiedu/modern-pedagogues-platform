"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { claimTourForSession, TOUR_START_EVENT, type TourStep, type TourStore } from "@/lib/admin-tour";

type Box = { top: number; left: number; width: number; height: number };
type Placement = { spot: Box | null; card: { top: number; left: number } | null };

const DESKTOP = "(min-width: 1024px)";
const GAP = 16;

function browserStore(): TourStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Guided tour of the admin area. Starts by itself once per sign-in (see `claimTourForSession`), can be skipped
 * with the button or Escape, and can be started again from the menu. On large screens it points at the real
 * menu; on phones and tablets, where the menu is hidden behind a button, each step is a card in the middle.
 */
export function AdminTour({ steps, sessionKey }: { steps: TourStep[]; sessionKey: string }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [wide, setWide] = useState(false);
  const [placement, setPlacement] = useState<Placement>({ spot: null, card: null });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const returnFocusTo = useRef<Element | null>(null);

  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;

  // Start by itself once per sign-in. The short delay lets the page settle; the claim happens inside the timer so
  // a cancelled timer (React re-running the effect in development) does not use up the one showing.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (claimTourForSession(browserStore(), sessionKey)) {
        returnFocusTo.current = document.activeElement;
        setIndex(0);
        setOpen(true);
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [sessionKey]);

  // "Take the tour" button in the menu.
  useEffect(() => {
    const start = () => {
      returnFocusTo.current = document.activeElement;
      setIndex(0);
      setOpen(true);
    };
    window.addEventListener(TOUR_START_EVENT, start);
    return () => window.removeEventListener(TOUR_START_EVENT, start);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    const el = returnFocusTo.current;
    if (el instanceof HTMLElement) el.focus();
  }, []);

  // Work out where the highlight and the card go.
  const measure = useCallback(() => {
    const isWide = window.matchMedia(DESKTOP).matches;
    setWide(isWide);
    const el = isWide && step?.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
    const rect = el?.getBoundingClientRect();
    if (!el || !rect || rect.width === 0 || rect.height === 0) {
      setPlacement({ spot: null, card: null });
      return;
    }
    const pad = 6;
    const cardW = cardRef.current?.offsetWidth ?? 352;
    const cardH = cardRef.current?.offsetHeight ?? 280;
    const left = Math.min(rect.right + 20, window.innerWidth - cardW - GAP);
    const top = Math.max(GAP, Math.min(rect.top, window.innerHeight - cardH - GAP));
    setPlacement({
      spot: { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 },
      card: { top, left },
    });
  }, [step]);

  useLayoutEffect(() => {
    if (!open) return;
    if (window.matchMedia(DESKTOP).matches && step?.target) {
      document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)?.scrollIntoView({ block: "nearest" });
    }
    // Measured on the next frame (and again after the card has been drawn) so the card's real height keeps it on screen.
    const first = window.requestAnimationFrame(() => {
      measure();
      second = window.requestAnimationFrame(measure);
    });
    let second = 0;
    return () => {
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
    };
  }, [open, step, measure]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, measure]);

  // Keep the page behind from scrolling while the tour is open, and put focus on the main button of each step.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (open) nextRef.current?.focus();
  }, [open, index]);

  const next = useCallback(() => (last ? close() : setIndex((i) => i + 1)), [last, close]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      back();
    } else if (e.key === "Tab") {
      // Keep keyboard focus inside the card.
      const focusable = cardRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0]!;
      const lastEl = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (!open || !step) return null;

  const pointed = placement.spot !== null && placement.card !== null;
  const cardStyle = pointed ? { top: placement.card!.top, left: placement.card!.left } : undefined;

  return (
    <div className="fixed inset-0 z-[100]" onKeyDown={onKeyDown}>
      {/* Catches clicks so nothing behind the tour is pressed by accident. */}
      <div className="absolute inset-0" aria-hidden="true" />
      {pointed ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-2xl ring-2 ring-gold"
          style={{ ...placement.spot!, boxShadow: "0 0 0 9999px rgba(11, 22, 55, 0.62)" }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-navy/60" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-tour-title"
        aria-describedby="admin-tour-body"
        data-testid="admin-tour"
        className={`absolute w-[min(22rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl bg-white p-5 text-navy shadow-2xl ${pointed ? "" : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"}`}
        style={cardStyle}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-navy/55">
          Step {index + 1} of {steps.length}
        </p>
        <h2 id="admin-tour-title" className="mt-1 text-xl font-semibold tracking-tight">
          {step.title}
        </h2>
        <div id="admin-tour-body">
          {step.body ? <p className="mt-2 text-sm leading-relaxed text-navy/80">{step.body}</p> : null}
          {!wide && step.compactHint ? <p className="mt-2 text-sm leading-relaxed text-navy/80">{step.compactHint}</p> : null}
          {step.items && step.items.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm leading-snug">
              {step.items.map((i) => (
                <li key={i.label}>
                  <span className="font-semibold">{i.label}.</span> <span className="text-navy/75">{i.text}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button type="button" onClick={close} className="rounded-full px-2 py-1 text-sm text-navy/65 underline underline-offset-4 hover:text-navy">
            {last ? "Close" : "Skip tour"}
          </button>
          <div className="flex gap-2">
            {index > 0 ? (
              <button type="button" onClick={back} className="rounded-full border border-navy/25 px-4 py-1.5 text-sm hover:border-navy/50">
                Back
              </button>
            ) : null}
            <button ref={nextRef} type="button" onClick={next} className="rounded-full bg-navy px-5 py-1.5 text-sm font-semibold text-cream hover:bg-navy/90">
              {last ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small button for the menu that starts the tour again. */
export function TakeTourButton({ className }: { className?: string }) {
  return (
    <button type="button" data-tour="replay" onClick={() => window.dispatchEvent(new Event(TOUR_START_EVENT))} className={className}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[18px] w-[18px]">
        <path d="M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.5a2.6 2.6 0 115 .8c0 1.6-2.5 2-2.5 3.7M12 17.2h.01" />
      </svg>
      Take the tour
    </button>
  );
}
