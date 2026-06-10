"use client";

import { useEffect, useRef, useState } from "react";
import { Search, UserCheck, MessageCircle, LifeBuoy } from "lucide-react";
import { PhoneFrame, SHOWCASE_SCREENS } from "@/components/landing/phone-screens";

/* "Por qué elegir ContrataCR" — a Thumbtack-style sticky-phone story that merges
   the how-it-works steps + the trust benefits into one client narrative. The
   points scroll on the left; the phone on the right swaps to the matching real
   app screen for the active point. Monochrome icons (serious tone). */
const POINTS = [
  {
    Icon: Search,
    title: "Describe tu proyecto",
    desc: "Cuéntanos qué necesitas y dónde, en tus propias palabras. Sin llamadas a ciegas ni intermediarios.",
  },
  {
    Icon: UserCheck,
    title: "Compara profesionales verificados",
    desc: "Revisa perfiles con identidad verificada contra los registros oficiales, reseñas reales, ubicación y precios.",
  },
  {
    Icon: MessageCircle,
    title: "Coordina por WhatsApp",
    desc: "Hablas directo con el profesional para acordar fecha y precio. Tú decides con quién trabajar.",
  },
  {
    Icon: LifeBuoy,
    title: "Con soporte cuando lo necesites",
    desc: "Deja tu reseña al terminar y, si algo no sale como esperabas, nuestro equipo está para ayudarte.",
  },
];

export function WhyContratacr() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const center = window.innerHeight / 2;
      let best = 0, bestDist = Infinity;
      refs.current.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - center);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      setActive(best);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, []);

  const ActiveScreen = SHOWCASE_SCREENS[active];

  return (
    <section className="relative py-20 sm:py-28 bg-white">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EBF5FB] text-[#009FD9] px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
            <span className="h-1.5 w-1.5 rounded-full bg-[#009FD9]" /> Cómo funciona
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-[#1a2744]">
            Todo para contratar con confianza
          </h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto">
            Del primer mensaje al trabajo terminado: simple, transparente y seguro.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
          {/* Left: scrolling points */}
          <div className="lg:order-1">
            {POINTS.map((p, i) => {
              const on = i === active;
              const Screen = SHOWCASE_SCREENS[i];
              const Icon = p.Icon;
              return (
                <div
                  key={p.title}
                  ref={(el) => { refs.current[i] = el; }}
                  className="py-6 lg:min-h-[58vh] lg:flex lg:flex-col lg:justify-center"
                >
                  <div className={`rounded-2xl border p-6 transition-all duration-300 ${on ? "border-[#e5e7eb] bg-white shadow-[0_16px_44px_rgba(16,39,68,0.10)]" : "border-transparent bg-transparent lg:opacity-50"}`}>
                    <div className="flex items-center gap-3">
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-colors ${on ? "bg-[#1a2744] text-white" : "bg-[#f3f4f6] text-[#1a2744]"}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <h3 className="text-lg font-extrabold text-[#1a2744]">{p.title}</h3>
                    </div>
                    <p className="mt-3 text-[15px] text-gray-500 leading-relaxed">{p.desc}</p>

                    {/* Inline phone on mobile */}
                    <div className="mt-6 lg:hidden">
                      <PhoneFrame><Screen /></PhoneFrame>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: sticky phone */}
          <div className="hidden lg:block lg:order-2">
            <div className="sticky top-24 flex justify-center">
              <div className="relative">
                <div aria-hidden className="pointer-events-none absolute -inset-10 -z-10 rounded-[3rem] bg-gradient-to-br from-[#EBF5FB] to-transparent opacity-70" />
                <div key={active} className="animate-tab-cards">
                  <PhoneFrame><ActiveScreen /></PhoneFrame>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
