import { Search, UserCheck, MessageCircle, ChevronRight } from "lucide-react";
import { FadeInUp } from "@/components/landing/fade-in-up";

// "Contrata en tres pasos" — a connected JOURNEY (1 → 2 → 3), not 3 isolated
// boxes. A gradient path links the steps; large colored numbers carry the
// progression. Presentation only.
const STEPS = [
  {
    n: 1,
    Icon: Search,
    title: "Describe tu proyecto",
    desc: "Cuéntanos qué necesitas y dónde. Sé tan detallado como quieras para recibir mejores opciones.",
  },
  {
    n: 2,
    Icon: UserCheck,
    title: "Compara profesionales",
    desc: "Revisa perfiles con identidad verificada, reseñas reales, ubicación y disponibilidad.",
  },
  {
    n: 3,
    Icon: MessageCircle,
    title: "Coordina y contrata",
    desc: "Hablas directo por WhatsApp con el profesional, sin intermediarios ni cargos extra.",
  },
];

export function HowItWorks() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28 bg-gradient-to-b from-white to-[#eef4f9]">
      {/* Soft brand accent so the section has depth, not flat white. */}
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-[42rem] rounded-full opacity-60"
        style={{ background: "radial-gradient(circle, rgba(0,159,217,0.14), transparent 70%)" }} />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EBF5FB] text-[#009FD9] px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
            <span className="h-1.5 w-1.5 rounded-full bg-[#009FD9]" /> Así de fácil
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-[#1a2744]">
            Contrata en tres pasos
          </h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto">
            Sin llamadas a ciegas ni intermediarios. Tú decides con quién trabajar.
          </p>
        </div>

        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-7">
          {/* The connecting PATH behind the step numbers (desktop). */}
          <div aria-hidden className="hidden md:block absolute top-[2.75rem] left-[16%] right-[16%] h-[3px] rounded-full bg-gradient-to-r from-[#009FD9]/10 via-[#009FD9]/45 to-[#009FD9]/10" />

          {STEPS.map(({ n, Icon, title, desc }, i) => (
            <FadeInUp key={n} delay={i * 130}>
              <div className="relative h-full flex flex-col items-center text-center">
                {/* Large prominent number — sits on the path. */}
                <div className="relative z-10 mb-6 grid place-items-center h-[5.5rem] w-[5.5rem] rounded-full bg-white ring-1 ring-[#e6eef5] shadow-[0_12px_30px_rgba(0,159,217,0.18)]">
                  <span className="grid place-items-center h-16 w-16 rounded-full bg-gradient-to-br from-[#009FD9] to-[#0078a8] text-white text-2xl font-extrabold shadow-inner">
                    {n}
                  </span>
                </div>

                {/* Step card */}
                <div className="group relative w-full flex-1 rounded-3xl bg-white border border-[#eef1f5] p-7 shadow-[0_10px_40px_rgba(16,39,68,0.06)] hover:shadow-[0_22px_55px_rgba(16,39,68,0.13)] hover:-translate-y-1.5 transition-all duration-300">
                  <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EBF5FB] text-[#009FD9] group-hover:scale-105 transition-transform">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-bold text-[#1a2744] text-lg mb-2">{title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                </div>

                {/* Forward chevron between steps (desktop). */}
                {i < STEPS.length - 1 && (
                  <ChevronRight aria-hidden className="hidden md:block absolute -right-[1.35rem] top-[2.1rem] z-10 h-6 w-6 text-[#009FD9]/60" />
                )}
              </div>
            </FadeInUp>
          ))}
        </div>
      </div>
    </section>
  );
}
