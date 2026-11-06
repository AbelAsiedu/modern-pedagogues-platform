"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared behaviour for the site's looping, self-advancing carousels.
 *
 * - Advances every `intervalMs` and wraps from the last item to the first, forever.
 * - Pauses while a mouse is over it (until they press a control), while the tab is hidden, and when the visitor presses Pause.
 *   It does NOT pause for keyboard focus: a button left focused after a click must not freeze the show.
 * - Keeps the time already shown when paused, so resuming continues the same slide instead of restarting it.
 * - Ignores "reduced motion" for timing (the content still rotates); the visual effects are what get switched off in CSS.
 */
export function useAutoplay(count: number, intervalMs: number) {
  const [index, setIndex] = useState(0);
  const [hover, setHover] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [hidden, setHidden] = useState(false);

  const safe = count > 0 ? Math.min(index, count - 1) : 0;
  const playing = count > 1 && !hover && !userPaused && !hidden;

  useEffect(() => {
    const update = () => setHidden(document.visibilityState === "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const startedAt = useRef(0);
  const elapsed = useRef(0);
  const lastIndex = useRef(safe);
  useEffect(() => {
    if (lastIndex.current !== safe) {
      lastIndex.current = safe;
      elapsed.current = 0;
    }
    if (!playing) return;
    startedAt.current = performance.now();
    const wait = Math.max(0, intervalMs - elapsed.current);
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), wait);
    return () => {
      clearTimeout(timer);
      elapsed.current += performance.now() - startedAt.current;
    };
  }, [playing, safe, intervalMs, count]);

  // Pressing any control is a deliberate choice: it overrides "the mouse is resting here" until the mouse leaves,
  // so clicking Play (or an arrow) while the pointer is over the slideshow does not leave it stuck.
  const hoverSuppressed = useRef(false);
  const interact = useCallback(() => {
    hoverSuppressed.current = true;
    setHover(false);
  }, []);

  const go = useCallback(
    (i: number) => {
      interact();
      setIndex(count > 0 ? ((i % count) + count) % count : 0);
    },
    [count, interact],
  );
  const next = useCallback(() => go(safe + 1), [go, safe]);
  const prev = useCallback(() => go(safe - 1), [go, safe]);

  /** Spread onto the carousel's root element. Only a real mouse pauses it; a touch tap must not leave it stuck. */
  const hoverProps = {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && !hoverSuppressed.current) setHover(true);
    },
    onPointerLeave: () => {
      hoverSuppressed.current = false;
      setHover(false);
    },
  };

  return { index: safe, go, next, prev, playing, userPaused, toggle: () => {
      interact();
      setUserPaused((p) => !p);
    }, hoverProps };
}
