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
const catImg = (id: string) =>
  `https://res.cloudinary.com/${CLOUD}/image/upload/f_auto,q_auto,c_fill,g_auto,w_600,h_600/contratacr/categorias/${id}`;

// Finalized CR categories with matching self-hosted imagery. ONE track, all
// distinct — a single set is far wider than any viewport, so the off-screen
// duplicate (for the seamless loop) never shows on screen.
const HOME_CATEGORIES = [
  "limpieza", "plomeria", "electricidad", "jardineria", "pintura", "carpinteria",
  "construccion", "cerrajeria", "mudanzas", "mecanica", "peluqueria",
  "entrenamiento_personal", "masajes", "psicologia", "desarrollo_web",
  "contabilidad", "marketing_digital", "fotografia", "dj_sonido",
];

const AUTO_SPEED = 0.5;       // px per frame (~30px/s) — slow, elegant glide.
const NUDGE_MS = 480;         // arrow-tween duration.
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function Card({ id, lifted }: { id: string; lifted: boolean }) {
  const label = getCategoryLabel(id);
  return (
    <div
      className="shrink-0 mr-4 sm:mr-6 py-2"
      style={{ transform: `translateY(${lifted ? "-20px" : "20px"})` }}
    >
      <Link
        href={`/buscar?categoria=${id}`}
        draggable={false}
        className="group relative block w-[220px] h-[220px] sm:w-[264px] sm:h-[264px] rounded-2xl overflow-hidden card-lift shadow-[0_6px_24px_rgba(0,0,0,0.12)] select-none"
      >
        <Image
          src={catImg(id)}
          alt={label}
          fill
          draggable={false}
          className="object-cover transition-transform duration-500 group-hover:scale-[1.07] pointer-events-none"
          sizes="264px"
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
  const reduced = useRef(false);
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

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.current = mq.matches;
    const onMq = () => { reduced.current = mq.matches; };
    mq.addEventListener?.("change", onMq);

    const wrap = (p: number) => {
      const h = half.current;
      if (h <= 0) return p;
      while (p <= -h) p += h;
      while (p > 0) p -= h;
      return p;
    };

    let raf = 0;
    const frame = (now: number) => {
      const h = half.current;
      if (h > 0) {
        if (tween.current) {
          const { from, to, start } = tween.current;
          const t = Math.min(1, (now - start) / NUDGE_MS);
          pos.current = from + (to - from) * easeInOut(t);
          if (t >= 1) tween.current = null;
        } else if (!paused.current && !reduced.current && !drag.current.active) {
          pos.current -= AUTO_SPEED;
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
      mq.removeEventListener?.("change", onMq);
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
