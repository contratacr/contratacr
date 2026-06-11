"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { getCategoryLabel } from "@/lib/data/categories";

/* ONE single staggered (zigzag) carousel. All cards live in ONE track that
   moves as a single unit (the up/down offset is purely visual). Motion is
   TRANSFORM-based with a float accumulator — NOT native scrollLeft (which
   browsers round to integers, so a sub-pixel/frame auto-scroll never moves).
   Auto-scrolls continuously + can be driven by drag/swipe or arrow buttons;
   auto pauses on hover/interaction and respects prefers-reduced-motion. */
const CLOUD = "dxxrjx2go";
// f_auto + q_auto + DPR-aware sizing handled by next/image `sizes`; base kept
// modest (≤600w) so mobile never pulls a heavy image while the track moves.
const catImg = (id: string) =>
  `https://res.cloudinary.com/${CLOUD}/image/upload/f_auto,q_auto,c_fill,g_auto,w_600,h_400/contratacr/categorias/${id}`;

// Finalized CR categories with matching self-hosted imagery. ONE track, all
// distinct — a single set is far wider than any viewport, so the off-screen
// duplicate (for the seamless loop) never shows on screen.
const HOME_CATEGORIES = [
  "limpieza", "plomeria", "electricidad", "jardineria", "pintura", "carpinteria",
  "construccion", "cerrajeria", "mudanzas", "mecanica", "peluqueria",
  "entrenamiento_personal", "masajes", "psicologia", "desarrollo_web",
  "contabilidad", "marketing_digital", "fotografia", "dj_sonido",
];

// Time-based (px per MILLISECOND) so the speed is identical on 60/90/120 Hz
// screens and dropped frames don't slow it down (it advances by elapsed time).
const AUTO_SPEED = 0.019;     // px/ms (~19px/s) — slow, relaxed glide.
const NUDGE_MS = 480;         // arrow-tween duration.
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function Card({ id, lifted }: { id: string; lifted: boolean }) {
  const label = getCategoryLabel(id);
  return (
    <div
      // Zigzag offset only from sm+ (desktop); on mobile the row is flat —
      // a single straight strip the user swipes with a finger.
      className={`shrink-0 mr-4 sm:mr-5 py-2 ${lifted ? "sm:-translate-y-5" : "sm:translate-y-5"}`}
    >
      <Link
        href={`/buscar?categoria=${id}`}
        draggable={false}
        // No per-card will-change/3d here — that promoted all 38 cards to their
        // own GPU layers and choked mobile. They now paint into the single track
        // layer; hover still scales fine (auto-promoted on hover, desktop only).
        className="group relative block w-[248px] h-[168px] sm:w-[300px] sm:h-[200px] rounded-lg overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.10)] sm:shadow-[0_4px_16px_rgba(0,0,0,0.10)] select-none transition-transform duration-300 ease-out hover:scale-[1.04] hover:z-10"
      >
        <Image
          src={catImg(id)}
          alt={label}
          fill
          draggable={false}
          loading="lazy"
          className="object-cover pointer-events-none"
          sizes="(max-width: 640px) 250px, 300px"
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.18) 58%, transparent 100%)" }}
        />
        <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between gap-2">
          <span className="text-white font-bold text-[15px] drop-shadow leading-tight line-clamp-2">{label}</span>
          <ArrowRight className="h-4 w-4 text-white/70 shrink-0 translate-x-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
        </div>
      </Link>
    </div>
  );
}

export function CategoryCarousel() {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  const pos = useRef(0);        // float translateX (px, ≤ 0 as it drifts left).
  const half = useRef(0);       // width of ONE set = scrollWidth / 2.
  const paused = useRef(false);
  // On mobile we never auto-scroll — the user swipes the single flat row by
  // hand (arrows are hidden on mobile too). Desktop keeps the auto glide.
  const autoEnabled = useRef(true);
  const tween = useRef<{ from: number; to: number; start: number } | null>(null);
  const drag = useRef({ active: false, startX: 0, startPos: 0, moved: false });

  useEffect(() => {
    const tr = track.current;
    if (!tr) return;

    const measure = () => { half.current = tr.scrollWidth / 2; };
    measure();
    // Re-measure once images load / on resize (scrollWidth grows as imgs paint).
    const ro = new ResizeObserver(measure);
    ro.observe(tr);
    window.addEventListener("resize", measure);

    // Auto-scroll on desktop only; mobile is swipe-driven (no auto-move).
    const mq = window.matchMedia("(min-width: 640px)");
    const syncAuto = () => { autoEnabled.current = mq.matches; };
    syncAuto();
    mq.addEventListener("change", syncAuto);

    const wrap = (p: number) => {
      const h = half.current;
      if (h <= 0) return p;
      while (p <= -h) p += h;
      while (p > 0) p -= h;
      return p;
    };

    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      if (!last) last = now;
      // Elapsed time, capped so returning from a background tab doesn't jump.
      let dt = now - last;
      last = now;
      if (dt > 50) dt = 50;

      const h = half.current;
      if (h > 0) {
        if (tween.current) {
          const { from, to, start } = tween.current;
          const t = Math.min(1, (now - start) / NUDGE_MS);
          pos.current = from + (to - from) * easeInOut(t);
          if (t >= 1) tween.current = null;
        } else if (autoEnabled.current && !paused.current && !drag.current.active) {
          // Desktop auto glide (reduced-motion intentionally ignored). On mobile
          // autoEnabled is false → the track only moves when the user swipes.
          pos.current -= AUTO_SPEED * dt;
        }
        pos.current = wrap(pos.current);
        tr.style.transform = `translate3d(${pos.current}px,0,0)`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      mq.removeEventListener("change", syncAuto);
    };
  }, []);

  // ── Pointer drag (mouse + touch via pointer events) ──
  const onPointerDown = (e: React.PointerEvent) => {
    paused.current = true;
    tween.current = null;
    drag.current = { active: true, startX: e.clientX, startPos: pos.current, moved: false };
    viewport.current?.classList.add("is-dragging");
    viewport.current?.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    pos.current = drag.current.startPos + dx; // wrapped in the next frame
  };
  const endDrag = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    viewport.current?.classList.remove("is-dragging");
    viewport.current?.releasePointerCapture?.(e.pointerId);
    if (drag.current.moved) {
      // Swallow the click that follows a real drag so it doesn't navigate.
      const stop = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
      track.current?.addEventListener("click", stop, { capture: true, once: true });
    }
    drag.current.active = false;
    paused.current = false;
  };

  const nudge = (dir: 1 | -1) => {
    const vp = viewport.current;
    if (!vp) return;
    const delta = Math.min(vp.clientWidth * 0.8, 600);
    // dir 1 = advance (content moves left → pos decreases); -1 = go back.
    tween.current = { from: pos.current, to: pos.current - dir * delta, start: performance.now() };
  };

  const loop = [...HOME_CATEGORIES, ...HOME_CATEGORIES];

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Anterior"
        onClick={() => nudge(-1)}
        className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 h-11 w-11 items-center justify-center rounded-full bg-white text-[#1a2744] shadow-[0_4px_16px_rgba(0,0,0,0.16)] hover:bg-[#f3f4f6] transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Siguiente"
        onClick={() => nudge(1)}
        className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 h-11 w-11 items-center justify-center rounded-full bg-white text-[#1a2744] shadow-[0_4px_16px_rgba(0,0,0,0.16)] hover:bg-[#f3f4f6] transition-colors"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div
        ref={viewport}
        className="cat-carousel cursor-grab"
        onMouseEnter={() => { paused.current = true; }}
        onMouseLeave={() => { if (!drag.current.active) paused.current = false; }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Extra vertical padding so the zigzag offset + hover lift never clip. */}
        <div ref={track} className="cat-track px-6 py-8 will-change-transform">
          {loop.map((id, i) => (
            <Card key={`${id}-${i}`} id={id} lifted={i % 2 === 0} />
          ))}
        </div>
      </div>
    </div>
  );
}
