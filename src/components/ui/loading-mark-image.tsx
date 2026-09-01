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
// How long the ghost of a departed route overlay keeps covering the swap. La
// pantalla nueva a veces tarda más de un cuadro en pintar (mapa, listas), y el
// fantasma se iba antes: ese hueco era el parpadeo raro que quedaba. Ahora
// cubre más tiempo y se va desvaneciendo, así que aunque la pantalla llegue
// tarde el relevo es un cruce suave y no un corte.
const GHOST_MS = 320;
const GHOST_FADE_MS = 180;

function spawnGhost(screen: HTMLElement, phaseMs: number) {
  const ghost = screen.cloneNode(true) as HTMLElement;
  ghost.querySelectorAll("script").forEach((s) => s.remove());
  ghost.style.animation = "none";
  ghost.style.opacity = "1";
  ghost.style.pointerEvents = "none";
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("data-ccr-loading-ghost", "");
  const mark = ghost.querySelector<HTMLElement>(".ccr-brand-loading-mark");
  if (mark) mark.style.animationDelay = `-${phaseMs}ms`;
  ghost.style.transition = `opacity ${GHOST_FADE_MS}ms linear`;
  document.body.appendChild(ghost);
  const desvanecer = window.setTimeout(() => { ghost.style.opacity = "0"; }, GHOST_MS - GHOST_FADE_MS);
  window.setTimeout(() => {
    window.clearTimeout(desvanecer);
    ghost.remove();
  }, GHOST_MS);
}

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
    const screen = img.closest<HTMLElement>(".ccr-page-route-loading, .ccr-delayed-loading");
    const isRouteOverlay = screen?.classList.contains("ccr-page-route-loading") ?? false;
    // When the breath reaches phase 0; before that the mark is still fading in.
    let breathStartsAt: number;
    // When the mark actually becomes visible (its wrapper's reveal delay).
    let visibleAt: number;
    if (now - previousHiddenAt < HANDOFF_WINDOW_MS) {
      const phase = (previousPhaseMs + (now - previousHiddenAt)) % BREATH_PERIOD_MS;
      img.style.animationDelay = `-${phase}ms`;
      if (screen) {
        // Continue visibly at once — the departed mark's ghost covers any
        // transient successor, so instant reveal can never flash.
        screen.style.animation = "none";
        screen.style.opacity = "1";
      }
      breathStartsAt = now - phase;
      visibleAt = now;
    } else {
      breathStartsAt = now - breathElapsed(img);
      const revealDelay = screen ? Number.parseFloat(getComputedStyle(screen).animationDelay) * 1000 : 0;
      visibleAt = now + (Number.isFinite(revealDelay) && revealDelay > 0 ? revealDelay : 0);
    }
    return () => {
      const end = performance.now();
      if (end < visibleAt) {
        // Gone before it ever showed: the next screen starts its own quiet wait.
        previousHiddenAt = Number.NEGATIVE_INFINITY;
        return;
      }
      previousHiddenAt = end;
      // A mark that vanished mid fade-in (breath not yet started) hands over
      // phase 0 — the next one continues at natural size, no restart.
      previousPhaseMs = end >= breathStartsAt ? (end - breathStartsAt) % BREATH_PERIOD_MS : 0;
      if (isRouteOverlay && screen) spawnGhost(screen, previousPhaseMs);
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
