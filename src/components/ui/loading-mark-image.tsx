"use client";

import Image from "next/image";
import { useLayoutEffect, useRef } from "react";

// Must match the mark's animation in globals.css: the breath starts after the
// same 600ms delay as the loading screen's fade-in and one breath lasts 2.4s.
const BREATH_DELAY_MS = 600;
const BREATH_PERIOD_MS = 2400;
// A loading screen that replaces another within this window is the same wait
// continuing (root fallback -> route fallback -> nested fallback), not a new one.
const HANDOFF_WINDOW_MS = 500;

// Where the previous mark was in its breath when it disappeared. The next mark
// picks up from there instead of fading in again and restarting the breath,
// which read as a blink between two breaths.
let previousHiddenAt = Number.NEGATIVE_INFINITY;
let previousPhaseMs = 0;

// How far into its breath a mark already is (server-streamed marks may be
// breathing before they hydrate, possibly with a delay set by the handoff
// script), or 0 when it has not started.
function breathElapsed(img: HTMLImageElement): number {
  const breath = img.getAnimations().find(
    (animation) => animation instanceof CSSAnimation && animation.animationName === "ccr-brand-loading-breathe",
  );
  if (typeof breath?.currentTime !== "number") return -BREATH_DELAY_MS;
  const delayMs = Number.parseFloat(getComputedStyle(img).animationDelay) * 1000;
  return breath.currentTime - (Number.isFinite(delayMs) ? delayMs : BREATH_DELAY_MS);
}

export function LoadingMarkImage() {
  const ref = useRef<HTMLImageElement | null>(null);

  useLayoutEffect(() => {
    const img = ref.current;
    if (!img) return;
    const now = performance.now();
    const screen = img.closest<HTMLElement>(".ccr-page-route-loading");
    // When the breath reaches phase 0; before that the mark is still fading in.
    let breathStartsAt: number;
    if (now - previousHiddenAt < HANDOFF_WINDOW_MS) {
      const phase = (previousPhaseMs + (now - previousHiddenAt)) % BREATH_PERIOD_MS;
      img.style.animationDelay = `-${phase}ms`;
      if (screen) {
        screen.style.animation = "none";
        screen.style.opacity = "1";
      }
      breathStartsAt = now - phase;
    } else {
      breathStartsAt = now - breathElapsed(img);
    }
    return () => {
      const end = performance.now();
      if (end < breathStartsAt) {
        // Gone before it ever showed: the next screen starts its own quiet wait.
        previousHiddenAt = Number.NEGATIVE_INFINITY;
        return;
      }
      previousHiddenAt = end;
      previousPhaseMs = (end - breathStartsAt) % BREATH_PERIOD_MS;
    };
  }, []);

  return (
    <Image
      ref={ref}
      src="/logo-mark-transparent.png"
      alt=""
      width={64}
      height={64}
      sizes="64px"
      priority
      className="ccr-brand-loading-mark"
    />
  );
}
