import { FadeInUp } from "@/components/landing/fade-in-up";
import { STEP_SCREENS, STEP_CONTENT } from "@/components/landing/step-screens";

// Option A — "Contrata en tres pasos" as alternating product rows (Stripe/
// Linear style): each step pairs honest copy with a REAL ContrataCR screen.
export function HowItWorksRows() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28 bg-white">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EBF5FB] text-[#009FD9] px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
            <span className="h-1.5 w-1.5 rounded-full bg-[#009FD9]" /> Así de fácil
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-[#1a2744]">Contrata en tres pasos</h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto">
            Sin llamadas a ciegas ni intermediarios. Tú decides con quién trabajar.
          </p>
        </div>

        <div className="space-y-16 sm:space-y-24">
          {STEP_CONTENT.map((step, i) => {
            const Screen = STEP_SCREENS[i];
            const flipped = i % 2 === 1;
            return (
              <div key={step.n} className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
                {/* Text */}
                <FadeInUp className={flipped ? "lg:order-2" : ""}>
                  <div className="max-w-md">
                    <div className="flex items-center gap-3">
                      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#009FD9] to-[#0078a8] text-white text-lg font-extrabold shadow-[0_12px_26px_rgba(0,159,217,0.32)]">
                        {step.n}
                      </span>
                      <span className="text-sm font-extrabold uppercase tracking-wide text-[#009FD9]">Paso {step.n}</span>
                    </div>
                    <h3 className="mt-5 text-2xl font-extrabold text-[#1a2744]">{step.title}</h3>
                    <p className="mt-3 text-[15px] text-gray-500 leading-relaxed">{step.desc}</p>
                  </div>
                </FadeInUp>

                {/* Screen */}
                <FadeInUp delay={120} className={flipped ? "lg:order-1" : ""}>
                  <div className="relative">
                    <div aria-hidden className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-[#EBF5FB] to-transparent opacity-70" />
                    <Screen />
                  </div>
                </FadeInUp>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
