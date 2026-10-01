"use client";

import { useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, ClipboardList, Search, Tag, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type PasoDeLaGuia = {
  clave: "profesionales" | "proyectos" | "empleos" | "promociones";
  titulo: string;
  texto: string;
  cta: string;
  href: string;
  video: string;
  poster: string;
  alt: string;
};

const ICONOS = { profesionales: Search, proyectos: ClipboardList, empleos: BriefcaseBusiness, promociones: Tag } as const;

// LA GUÍA DE LA APP: cuatro cosas que se hacen en ContrataCR y, al lado, el
// teléfono con la pantalla REAL de cada una. Avanza sola; en cuanto la persona
// toca un paso, se queda en ese (y con «reducir movimiento» no avanza nunca).
// Las cuatro pantallas viven montadas una sobre otra y se funden: cambiar de
// paso no espera a que baje una imagen.
export function GuiaDeLaApp({ pasos }: { pasos: PasoDeLaGuia[] }) {
  const [activo, setActivo] = useState(0);
  const [quieta, setQuieta] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const pastillas = useRef<HTMLDivElement | null>(null);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const caja = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  // Solo se reproduce cuando la sección está a la vista: no gasta datos ni batería antes.
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const o = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    o.observe(el);
    return () => o.disconnect();
  }, []);

  // El video del paso elegido arranca desde el inicio; los demás se pausan.
  useEffect(() => {
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    videos.current.forEach((v, i) => {
      if (!v) return;
      if (i === activo && visible && !quieto) {
        v.currentTime = 0;
        v.play().catch(() => {});
      } else v.pause();
    });
    setProgreso(0);
  }, [activo, visible]);

  // Al terminar un video pasa al siguiente paso; si la persona eligió uno, se repite ese.
  const alTerminar = (i: number) => {
    if (i !== activo) return;
    if (quieta) { const v = videos.current[i]; if (v) { v.currentTime = 0; v.play().catch(() => {}); } return; }
    setActivo((activo + 1) % pasos.length);
  };

  const elegir = (i: number) => {
    setQuieta(true);
    setActivo(i);
    pastillas.current?.children[i]?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  };

  const paso = pasos[activo];

  return (
    <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:gap-16">
      {/* Pasos: en computadora, lista a la izquierda. */}
      <ol className="hidden space-y-3 lg:block">
        {pasos.map((p, i) => {
          const Icono = ICONOS[p.clave];
          const elegido = i === activo;
          return (
            <li key={p.clave}>
              <button
                type="button"
                onClick={() => elegir(i)}
                aria-pressed={elegido}
                className={cn(
                  "group relative flex w-full items-start gap-4 overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300",
                  elegido ? "border-[#bfe4f4] bg-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)]" : "border-transparent hover:bg-white/60",
                )}
              >
                <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-colors", elegido ? "bg-[#009FD9] text-white" : "bg-[#e8f4fa] text-[#0089bb]")}>
                  <Icono className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-extrabold leading-snug text-[#1a2744]">{p.titulo}</span>
                  <span className={cn("block overflow-hidden text-[15px] leading-relaxed text-[#5b6778] transition-all duration-300", elegido ? "mt-1 max-h-24 opacity-100" : "max-h-0 opacity-0")}>{p.texto}</span>
                </span>
                {/* La barra de tiempo: cuánto falta para el siguiente paso. */}
                {elegido && (
                  <span aria-hidden className="absolute inset-x-5 bottom-0 h-[3px] overflow-hidden rounded-full bg-[#e3f2fa]">
                    <span className="block h-full origin-left rounded-full bg-[#009FD9]" style={{ transform: `scaleX(${progreso})` }} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
        <li className="pl-5 pt-2">
          <Link href={paso.href} className="inline-flex items-center gap-1.5 text-[15px] font-bold text-[#009FD9] hover:underline">
            {paso.cta}<ArrowRight className="h-4 w-4" />
          </Link>
        </li>
      </ol>

      {/* El teléfono, con las cuatro pantallas fundiéndose. */}
      <div ref={caja} className="relative flex flex-col items-center">
        <div aria-hidden className="pointer-events-none absolute bottom-24 left-1/2 h-6 w-48 -translate-x-1/2 rounded-[50%] bg-[#1a2744]/10 blur-2xl lg:bottom-1" />
        <div className="relative w-[262px] sm:w-[290px] lg:w-[320px]">
          <div aria-hidden className="absolute -left-[2px] top-[108px] h-8 w-[3px] rounded-l-sm bg-[#2b2f36]" />
          <div aria-hidden className="absolute -left-[2px] top-[152px] h-12 w-[3px] rounded-l-sm bg-[#2b2f36]" />
          <div aria-hidden className="absolute -right-[2px] top-[140px] h-16 w-[3px] rounded-r-sm bg-[#2b2f36]" />
          <div
            className="relative"
            style={{
              background: "linear-gradient(135deg,#f1f3f6 0%,#c6cbd2 18%,#777c85 50%,#c6cbd2 82%,#f1f3f6 100%)",
              borderRadius: 54,
              padding: 3,
              boxShadow: "0 50px 100px -28px rgba(15,23,42,0.50), 0 24px 48px -22px rgba(15,23,42,0.42), inset 0 0 0 0.5px rgba(255,255,255,0.45)",
            }}
          >
            <div className="relative" style={{ background: "#04060a", borderRadius: 51, padding: 8 }}>
              <div className="relative overflow-hidden bg-white" style={{ borderRadius: 44, aspectRatio: "588 / 1280" }}>
                {pasos.map((p, i) => (
                  <video
                    key={p.clave}
                    ref={(el) => { videos.current[i] = el; }}
                    src={p.video}
                    poster={p.poster}
                    muted
                    playsInline
                    preload={i === activo ? "auto" : "metadata"}
                    aria-label={i === activo ? p.alt : undefined}
                    aria-hidden={i !== activo || undefined}
                    onTimeUpdate={(e) => { if (i === activo && e.currentTarget.duration) setProgreso(e.currentTarget.currentTime / e.currentTarget.duration); }}
                    onEnded={() => alTerminar(i)}
                    className={cn("absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500", i === activo ? "opacity-100" : "opacity-0")}
                  />
                ))}
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-20 h-16 bg-gradient-to-b from-white/14 to-transparent" />
              </div>
            </div>
          </div>
        </div>

        {/* En el teléfono y la tableta: pastillas debajo del aparato y la explicación del paso elegido. */}
        <div className="mt-7 w-full lg:hidden">
          <div ref={pastillas} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:justify-center">
            {pasos.map((p, i) => {
              const Icono = ICONOS[p.clave];
              const elegido = i === activo;
              return (
                <button
                  key={p.clave}
                  type="button"
                  onClick={() => elegir(i)}
                  aria-pressed={elegido}
                  className={cn(
                    "relative flex h-10 shrink-0 items-center gap-2 overflow-hidden rounded-full border px-4 text-[14px] font-bold transition-colors",
                    elegido ? "border-[#009FD9] bg-[#009FD9] text-white" : "border-[#dbe5ee] bg-white text-[#3c4a5c]",
                  )}
                >
                  {/* El avance del video, como un relleno más oscuro dentro de la pastilla. */}
                  {elegido && <span aria-hidden className="absolute inset-y-0 left-0 w-full origin-left bg-[#0089bb]" style={{ transform: `scaleX(${progreso})` }} />}
                  <Icono className="relative h-4 w-4" strokeWidth={2.2} /><span className="relative">{p.titulo}</span>
                </button>
              );
            })}
          </div>
          <div key={paso.clave} className="ccr-entrada mx-auto mt-4 max-w-md text-center">
            <p className="text-[15px] leading-relaxed text-[#5b6778]">{paso.texto}</p>
            <Link href={paso.href} className="mt-2 inline-flex items-center gap-1.5 text-[15px] font-bold text-[#009FD9]">
              {paso.cta}<ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
