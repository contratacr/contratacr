"use client";

import { useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, ClipboardList, Search, Tag, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type PasoDeLaGuia = {
  clave: "profesionales" | "proyectos" | "empleos" | "promociones";
  titulo: string;
  pestana: string;
  texto: string;
  cta: string;
  href: string;
  video: string;
  poster: string;
  alt: string;
};

// El azul del paso elegido va EN LÍNEA: no depende de que la hoja de estilos esté al día.
const CAJA_ACTIVA = { background: "linear-gradient(135deg, #33b8ea 0%, #0089c2 100%)", boxShadow: "0 10px 22px -10px rgba(0, 137, 194, 0.8)" } as const;
const ICONOS = { profesionales: Search, proyectos: ClipboardList, empleos: BriefcaseBusiness, promociones: Tag } as const;

// LA GUÍA DE LA APP: cuatro cosas que se hacen en ContrataCR y, al lado, el
// teléfono con la pantalla REAL de cada una. Avanza sola; en cuanto la persona
// toca un paso, se queda en ese (y con «reducir movimiento» no avanza nunca).
// Las cuatro pantallas viven montadas una sobre otra y se funden: cambiar de
// paso no espera a que baje una imagen.
export function GuiaDeLaApp({ pasos }: { pasos: PasoDeLaGuia[] }) {
  const [activo, setActivo] = useState(0);
  const [quieta, setQuieta] = useState(false);
  // La barra no se mueve con «timeupdate» (salta ~4 veces por segundo): es una
  // animación lineal de CSS que dura lo mismo que el video, como las historias
  // de Instagram. Se pausa si el video se pausa.
  const [duracion, setDuracion] = useState(0);
  const [corriendo, setCorriendo] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const caja = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  // Índice del video que ya está pintando cuadros: hasta entonces la imagen fija lo tapa.
  const [pintando, setPintando] = useState(-1);
  // El video ANTERIOR sigue a la vista debajo hasta que el nuevo ya corre: así el
  // cambio es un fundido limpio (imagen del nuevo encima) y nunca se ve blanco.
  const [previo, setPrevio] = useState<number | null>(null);
  const activoAnterior = useRef(0);
  useEffect(() => {
    if (activoAnterior.current !== activo) { setPrevio(activoAnterior.current); activoAnterior.current = activo; }
  }, [activo]);

  // Arranca cuando se ve ~50 % del teléfono y SIGUE corriendo mientras la persona
  // se mueve; solo se pausa cuando la sección sale del todo de la pantalla.
  // (Con root null funciona igual cuando el que se desplaza es <main>, en la app.)
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const o = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) { setVisible(false); return; }
      const alto = Math.min(e.boundingClientRect.height, e.rootBounds?.height ?? window.innerHeight);
      if (e.intersectionRect.height >= alto * 0.5) setVisible(true);
    }, { threshold: [0, 0.25, 0.5, 0.6, 0.75, 0.9, 1] });
    o.observe(el);
    return () => o.disconnect();
  }, []);

  // El video del paso elegido arranca desde el inicio; los demás se pausan.
  useEffect(() => {
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    videos.current.forEach((v, i) => {
      if (!v) return;
      // Solo un CAMBIO de paso vuelve al inicio. Salir y volver a la pantalla
      // continúa donde iba (antes reiniciaba y el video parecía repetirse).
      if (i !== activo) { v.pause(); v.currentTime = 0; }
      else if (visible && !quieto) v.play().catch(() => {});
      else v.pause();
    });
  }, [activo, visible]);

  // SIEMPRE CORRIENDO: si el navegador lo pausa por su cuenta (al volver a la
  // pestaña, al ahorrar batería, al terminar de cargar), se reanuda.
  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => {
      const v = videos.current[activo];
      if (v && v.paused && !v.ended && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) v.play().catch(() => {});
    }, 1000);
    return () => window.clearInterval(id);
  }, [activo, visible]);

  // Al terminar un video pasa al siguiente paso; si la persona eligió uno, se repite ese.
  const alTerminar = (i: number) => {
    if (i !== activo) return;
    // Aunque la persona haya tocado una opción, al terminar pasa a la siguiente.
    setActivo((activo + 1) % pasos.length);
  };

  const elegir = (i: number) => {
    setQuieta(true);
    setActivo(i);
      };

  const paso = pasos[activo];

  return (
    <div className="grid grid-cols-1 items-center gap-6 lg:mx-auto lg:max-w-[920px] lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
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
                  elegido ? "border-transparent bg-[#eef7fc]" : "border-transparent bg-transparent hover:bg-[#f6f9fc]",
                )}
              >
                <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-all", elegido ? "text-white" : "ccr-caja-icono")} style={elegido ? CAJA_ACTIVA : undefined}>
                  <Icono className="h-[22px] w-[22px]" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-extrabold leading-snug text-[#1a2744]">{p.titulo}</span>
                  <span className="mt-1 block text-[15px] leading-relaxed text-[#5b6778]">{p.texto}</span>
                </span>
                {/* La barra de tiempo: cuánto falta para el siguiente paso. */}
                {elegido && (
                  <span aria-hidden className="absolute inset-x-5 bottom-0 h-[3px] overflow-hidden rounded-full bg-[#e3f2fa]">
                    <span key={`${activo}-${vuelta}`} className="ccr-guia-progreso block h-full w-full origin-left rounded-full bg-[#009FD9]" style={{ animationDuration: `${duracion}s`, animationPlayState: corriendo && duracion ? "running" : "paused" }} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      {/* En el teléfono y la tableta: pestañas con ícono ENCIMA del aparato, como
          las de «Los servicios más buscados». La raya de abajo se llena con el video. */}
      <div role="tablist" className="-mx-4 grid grid-cols-4 border-b border-[#e3e9ef] px-2 lg:hidden">
        {pasos.map((p, i) => {
          const Icono = ICONOS[p.clave];
          const elegido = i === activo;
          return (
            <button
              key={p.clave}
              type="button"
              role="tab"
              aria-selected={elegido}
              onClick={() => elegir(i)}
              className={cn("relative flex min-w-0 flex-col items-center gap-1.5 pb-3 pt-1 text-[13px] font-semibold transition-colors", elegido ? "text-[#009FD9]" : "text-[#6b7686]")}
            >
              <span className={cn("grid h-11 w-11 place-items-center rounded-2xl transition-colors", elegido ? "text-white" : "ccr-caja-icono")} style={elegido ? CAJA_ACTIVA : undefined}>
                <Icono className="h-[22px] w-[22px]" strokeWidth={1.8} />
              </span>
              <span className="max-w-full truncate">{p.pestana}</span>
              <span aria-hidden className={cn("absolute inset-x-2 bottom-0 h-[3px] overflow-hidden rounded-full", elegido ? "bg-[#cfeaf7]" : "bg-transparent")}>
                {elegido && <span key={`${activo}-${vuelta}`} className="ccr-guia-progreso block h-full w-full origin-left rounded-full bg-[#009FD9]" style={{ animationDuration: `${duracion}s`, animationPlayState: corriendo && duracion ? "running" : "paused" }} />}
              </span>
            </button>
          );
        })}
      </div>

      {/* El teléfono, con las cuatro pantallas fundiéndose. */}
      <div ref={caja} className="relative flex flex-col items-center">
        <div aria-hidden className="pointer-events-none absolute bottom-24 left-1/2 h-5 w-44 -translate-x-1/2 rounded-[50%] bg-[#1a2744]/10 blur-xl lg:bottom-2" />
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
              // Sombra corta: se desvanece antes de que empiece la sección siguiente (si
              // pasa de largo, el fondo blanco de abajo la corta y se ve una línea).
              boxShadow: "0 26px 48px -22px rgba(15,23,42,0.42), 0 12px 24px -16px rgba(15,23,42,0.30), inset 0 0 0 0.5px rgba(255,255,255,0.45)",
            }}
          >
            <div className="relative" style={{ background: "#04060a", borderRadius: 51, padding: 8 }}>
              <div className="relative overflow-hidden bg-white" style={{ borderRadius: 44, aspectRatio: "588 / 1280" }}>
                {pasos.map((p, i) => (
                  <video
                    key={p.clave}
                    ref={(el) => {
                      videos.current[i] = el;
                      // React no escribe el atributo «muted» en el HTML: Safari ve un
                      // video con sonido y BLOQUEA la reproducción automática (sale
                      // el botón de play). Se fuerza aquí, antes de cargar.
                      if (el) { el.muted = true; el.defaultMuted = true; el.setAttribute("muted", ""); el.setAttribute("playsinline", ""); }
                    }}
                    src={p.video}
                    muted
                    playsInline
                    autoPlay={i === 0}
                    // Todos se descargan desde el principio (son cortos): al cambiar de paso el
                    // video ya está listo y arranca al instante.
                    preload="auto"
                    aria-label={i === activo ? p.alt : undefined}
                    aria-hidden={i !== activo || undefined}
                    onPlaying={(e) => { if (i === activo) { setPintando(i); setPrevio(null); setDuracion(e.currentTarget.duration || 0); setCorriendo(true); } }}
                    onPause={() => { if (i === activo) setCorriendo(false); }}
                    onEnded={() => alTerminar(i)}
                    // Safari a veces rechaza el primer play() si el video aún no
                    // cargó: al estar listo se vuelve a intentar.
                    onCanPlay={(e) => { if (i === activo && visible && e.currentTarget.paused) e.currentTarget.play().catch(() => {}); }}
                    className={cn("ccr-guia-video absolute inset-0 h-full w-full object-cover object-top", i === activo ? "z-[2] opacity-100" : i === previo ? "z-[1] opacity-100" : "opacity-0")}
                  />
                ))}
                {/* La primera imagen va APARTE y ENCIMA del video: el «poster» nativo
                    pintaba el botón de play de iOS. El video activo queda SIEMPRE con
                    opacidad 1 debajo: WebKit no deja arrancar un video que no «se ve». */}
                {pasos.map((p, i) => (
                  // eslint-disable-next-line @next/next/no-img-element -- imagen fija del tamaño justo
                  <img key={p.clave} src={p.poster} alt="" aria-hidden data-guia-poster className={cn("pointer-events-none absolute inset-0 z-10 h-full w-full object-cover object-top transition-opacity duration-200 ease-out", i === activo && pintando !== activo ? "opacity-100" : "opacity-0")} />
                ))}
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-20 h-16 bg-gradient-to-b from-white/14 to-transparent" />
              </div>
            </div>
          </div>
        </div>

        {/* En el teléfono y la tableta: el texto del paso elegido debajo del aparato. */}
        <div className="mt-2 w-full lg:hidden">
          {/* Cambia AL MISMO TIEMPO que la pestaña: sin animación de entrada. */}
          <div className="mx-auto mt-4 max-w-md text-center">
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
