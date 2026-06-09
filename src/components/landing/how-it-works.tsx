import { Search, UserCheck, MessageCircle } from "lucide-react";
import { FadeInUp } from "@/components/landing/fade-in-up";

// "Contrata en tres pasos" — a JOURNEY told with oversized ghost numerals + a
// connecting path. Distinct from the other sections' card grids. Presentation only.
const STEPS = [
  {
    n: "01",
    Icon: Search,
    title: "Describe tu proyecto",
    desc: "Cuéntanos qué necesitas y dónde. Sé tan detallado como quieras para recibir mejores opciones.",
  },
  {
    n: "02",
    Icon: UserCheck,
    title: "Compara profesionales",
    desc: "Revisa perfiles con identidad verificada, reseñas reales, ubicación y disponibilidad.",
  },
  {
    n: "03",
    Icon: MessageCircle,
    title: "Coordina y contrata",
    desc: "Hablas directo por WhatsApp con el profesional, sin intermediarios ni cargos extra.",
  },
];

export function HowItWorks() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28 bg-white">
      {/* Faint dotted path wash for depth */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#e5e7eb] to-transparent" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EBF5FB] text-[#009FD9] px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
              <span className="h-1.5 w-1.5 rounded-full bg-[#009FD9]" /> Así de fácil
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-[#1a2744]">
              Contrata en tres pasos
            </h2>
          </div>
          <p className="text-gray-500 max-w-sm sm:text-right">
            Sin llamadas a ciegas ni intermediarios. Tú decides con quién trabajar.
          </p>
        </div>

        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-12">
          {/* Connecting path behind the row (desktop) */}
          <div aria-hidden className="hidden md:block absolute left-0 right-0 top-7 h-[2px] bg-gradient-to-r from-[#009FD9]/0 via-[#009FD9]/25 to-[#009FD9]/0" />

          {STEPS.map(({ n, Icon, title, desc }, i) => (
            <FadeInUp key={n} delay={i * 130}>
              <div className="group relative">
                {/* Oversized ghost numeral */}
                <span aria-hidden className="pointer-events-none absolute -top-10 -left-2 select-none text-[7rem] font-black leading-none tracking-tighter text-[#1a2744]/[0.04]">
                  {n}
                </span>

                <div className="relative">
                  {/* Node dot on the path */}
                  <span className="relative z-10 mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#009FD9] to-[#0078a8] text-white shadow-[0_12px_26px_rgba(0,159,217,0.30)] group-hover:-translate-y-1 transition-transform duration-300">
                    <Icon className="h-6 w-6" />
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-extrabold text-[#009FD9]">{n}</span>
                    <h3 className="font-bold text-[#1a2744] text-lg">{title}</h3>
                  </div>
                  <p className="mt-2 text-sm text-gray-500 leading-relaxed max-w-xs">{desc}</p>
                </div>
              </div>
            </FadeInUp>
          ))}
        </div>
      </div>
    </section>
  );
}
