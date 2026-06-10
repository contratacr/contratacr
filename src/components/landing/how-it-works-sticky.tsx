"use client";

import { useEffect, useRef, useState } from "react";
import { STEP_SCREENS, STEP_CONTENT } from "@/components/landing/step-screens";

// Option B — "Contrata en tres pasos" as a sticky-scroll story: the step texts
// scroll on the left while ONE visual on the right swaps to the active step.
export function HowItWorksSticky() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  // Deterministic: the active step is the one whose vertical center is closest
  // to the viewport center. Robust across viewport sizes (no IO band quirks).
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
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const ActiveScreen = STEP_SCREENS[active];

  return (
    <section className="relative py-20 sm:py-28 bg-[#f7f9fc]">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EBF5FB] text-[#009FD9] px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
            <span className="h-1.5 w-1.5 rounded-full bg-[#009FD9]" /> Así de fácil
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-[#1a2744]">Contrata en tres pasos</h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto">
            Sin llamadas a ciegas ni intermediarios. Tú decides con quién trabajar.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
          {/* Left: scrolling steps */}
          <div>
            {STEP_CONTENT.map((step, i) => {
              const on = i === active;
              const Screen = STEP_SCREENS[i];
              return (
                <div
                  key={step.n}
                  data-idx={i}
                  ref={(el) => { refs.current[i] = el; }}
                  className="py-8 lg:min-h-[60vh] lg:flex lg:flex-col lg:justify-center"
                >
                  <div className={`flex items-center gap-3 transition-opacity duration-300 ${on ? "opacity-100" : "lg:opacity-40"}`}>
                    <span className={`grid h-12 w-12 place-items-center rounded-2xl text-lg font-extrabold transition-all duration-300 ${on ? "bg-gradient-to-br from-[#009FD9] to-[#0078a8] text-white shadow-[0_12px_26px_rgba(0,159,217,0.32)]" : "bg-[#e8edf3] text-[#9ca3af]"}`}>
                      {step.n}
                    </span>
                    <span className={`text-sm font-extrabold uppercase tracking-wide ${on ? "text-[#009FD9]" : "text-[#9ca3af]"}`}>Paso {step.n}</span>
                  </div>
                  <h3 className={`mt-5 text-2xl font-extrabold transition-opacity duration-300 ${on ? "opacity-100 text-[#1a2744]" : "lg:opacity-40 text-[#1a2744]"}`}>{step.title}</h3>
                  <p className={`mt-3 text-[15px] leading-relaxed transition-opacity duration-300 ${on ? "opacity-100 text-gray-500" : "lg:opacity-40 text-gray-500"} max-w-md`}>{step.desc}</p>

                  {/* Inline visual on mobile (no sticky there) */}
                  <div className="mt-6 lg:hidden">
                    <Screen />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: sticky visual that swaps */}
          <div className="hidden lg:block">
            <div className="sticky top-28">
              <div className="relative">
                <div aria-hidden className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-[#EBF5FB] to-transparent opacity-70" />
                <div key={active} className="animate-tab-cards">
                  <ActiveScreen />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
