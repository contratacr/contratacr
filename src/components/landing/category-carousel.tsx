"use client";

import { useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { getCategoryLabel } from "@/lib/data/categories";

/* ONE single staggered (zigzag) carousel. All cards live in ONE horizontal
   track that moves as a single unit; the vertical up/down offset is purely
   visual. Auto-scrolls slowly + can be dragged/swiped or nudged with arrows;
   auto pauses on hover/interaction and respects prefers-reduced-motion. */
const CLOUD = "dxxrjx2go";
const catImg = (id: string) =>
  `https://res.cloudinary.com/${CLOUD}/image/upload/f_auto,q_auto,c_fill,g_auto,w_600,h_450/contratacr/categorias/${id}`;

// Finalized CR categories we have matching self-hosted imagery for. ONE track,
// so all 19 are distinct — a single set is far wider than any viewport and the
// off-screen duplicate (for the loop) never shows on screen.
const HOME_CATEGORIES = [
  "limpieza", "plomeria", "electricidad", "jardineria", "pintura", "carpinteria",
  "construccion", "cerrajeria", "mudanzas", "mecanica", "peluqueria",
  "entrenamiento_personal", "masajes", "psicologia", "desarrollo_web",
  "contabilidad", "marketing_digital", "fotografia", "dj_sonido",
];

const AUTO_SPEED = 0.45; // px per frame (~27px/s) — slow, elegant glide.

function Card({ id, lifted }: { id: string; lifted: boolean }) {
  const label = getCategoryLabel(id);
  return (
    <div
      className="shrink-0 mr-4 sm:mr-6 py-2"
      style={{ transform: `translateY(${lifted ? "-18px" : "18px"})` }}
    >
      <Link
        href={`/buscar?categoria=${id}`}
        draggable={false}
        className="group relative block w-[200px] sm:w-[248px] h-[150px] sm:h-[186px] rounded-2xl overflow-hidden card-lift shadow-[0_6px_22px_rgba(0,0,0,0.10)] select-none"
      >
        <Image
          src={catImg(id)}
          alt={label}
          fill
          draggable={false}
          className="object-cover transition-transform duration-500 group-hover:scale-[1.07] pointer-events-none"
          sizes="248px"
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.2) 55%, transparent 100%)" }}
        />
        <div className="absolute bottom-0 left-0 right-0 p-3.5 flex items-end justify-between gap-2">
          <span className="text-white font-bold text-sm drop-shadow leading-tight line-clamp-2">{label}</span>
          <ArrowRight className="h-4 w-4 text-white/70 shrink-0 translate-x-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
        </div>
      </Link>
    </div>
  );
}

export function CategoryCarousel() {
  const scroller = useRef<HTMLDivElement>(null);
  const paused = useRef(false);       // hover / interaction pause
  const reduced = useRef(false);      // prefers-reduced-motion
  const drag = useRef<{ active: boolean; startX: number; startScroll: number; moved: boolean }>({
    active: false, startX: 0, startScroll: 0, moved: false,
  });

  // Keep scrollLeft within one set width [0, half) so the loop is seamless.
  const normalize = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const half = el.scrollWidth / 2;
    if (half <= 0) return;
    if (el.scrollLeft >= half) el.scrollLeft -= half;
    else if (el.scrollLeft < 0) el.scrollLeft += half;
  }, []);

  // Auto-scroll loop (rAF). Pauses on hover/drag and when reduced-motion is on.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.current = mq.matches;
    const onMq = () => { reduced.current = mq.matches; };
    mq.addEventListener?.("change", onMq);

    // Start mid-set so we can scroll either way without hitting an edge.
    el.scrollLeft = el.scrollWidth / 4;

    let raf = 0;
    const tick = () => {
      if (!paused.current && !reduced.current && el.scrollWidth > el.clientWidth) {
        el.scrollLeft += AUTO_SPEED;
        normalize();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); mq.removeEventListener?.("change", onMq); };
  }, [normalize]);

  // Pointer drag (mouse). Touch uses native scrolling; we just normalize on scroll.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return; // let native touch scroll handle it
    const el = scroller.current;
    if (!el) return;
    paused.current = true;
    drag.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
    el.classList.add("is-dragging");
    el.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const el = scroller.current;
    if (!el) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    el.scrollLeft = drag.current.startScroll - dx;
    normalize();
  };
  const endDrag = (e: React.PointerEvent) => {
    const el = scroller.current;
    if (el) { el.classList.remove("is-dragging"); el.releasePointerCapture?.(e.pointerId); }
    // Prevent the click that follows a real drag from navigating.
    if (drag.current.moved) {
      const stop = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
      el?.addEventListener("click", stop, { capture: true, once: true });
    }
    drag.current.active = false;
    paused.current = false;
  };

  const nudge = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 540), behavior: "smooth" });
  };

  const loop = [...HOME_CATEGORIES, ...HOME_CATEGORIES];

  return (
    <div className="relative">
      {/* Arrow controls (hidden on small screens — swipe instead) */}
      <button
        type="button"
        aria-label="Anterior"
        onClick={() => nudge(-1)}
        className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 h-11 w-11 items-center justify-center rounded-full bg-white text-[#1a2744] shadow-[0_4px_16px_rgba(0,0,0,0.14)] hover:bg-[#f3f4f6] transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Siguiente"
        onClick={() => nudge(1)}
        className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 h-11 w-11 items-center justify-center rounded-full bg-white text-[#1a2744] shadow-[0_4px_16px_rgba(0,0,0,0.14)] hover:bg-[#f3f4f6] transition-colors"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div
        ref={scroller}
        className="cat-carousel cursor-grab"
        onMouseEnter={() => { paused.current = true; }}
        onMouseLeave={() => { if (!drag.current.active) paused.current = false; }}
        onScroll={normalize}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Extra vertical padding so the zigzag offset + hover lift never clip. */}
        <div className="cat-track px-6 py-7">
          {loop.map((id, i) => (
            <Card key={`${id}-${i}`} id={id} lifted={i % 2 === 0} />
          ))}
        </div>
      </div>
    </div>
  );
}
