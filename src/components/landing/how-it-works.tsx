import { Search, UserCheck, MessageCircle, ArrowRight } from "lucide-react";
import { FadeInUp } from "@/components/landing/fade-in-up";

// "Contrata en tres pasos" — a premium connected JOURNEY: a gradient progress
// path threads through glowing icon nodes; elevated cards with ghost numerals.
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
    <section className="relative overflow-hidden py-20 sm:py-28 bg-gradient-to-b from-white via-white to-[#eef4f9]">
      <div aria-hidden className="pointer-events-none absolute -top-28 left-1/2 -translate-x-1/2 h-80 w-[46rem] rounded-full opacity-70"
        style={{ background: "radial-gradient(circle, rgba(0,159,217,0.13), transparent 70%)" }} />

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

        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-7">
          {/* Gradient progress path threading the icon nodes (desktop) */}
          <div aria-hidden className="hidden md:block absolute top-[3.25rem] left-[18%] right-[18%] h-[3px] rounded-full"
            style={{ background: "linear-gradient(90deg, rgba(0,159,217,0) 0%, rgba(0,159,217,0.45) 18%, rgba(0,159,217,0.45) 82%, rgba(0,159,217,0) 100%)" }} />

          {STEPS.map(({ n, Icon, title, desc }, i) => (
            <FadeInUp key={n} delay={i * 140}>
              <div className="group relative flex h-full flex-col items-center text-center">
                {/* Glowing gradient icon node on the path */}
                <div className="relative z-10 mb-7">
                  <span aria-hidden className="absolute inset-0 -z-10 rounded-2xl blur-xl opacity-50"
                    style={{ background: "radial-gradient(circle, rgba(0,159,217,0.55), transparent 70%)" }} />
                  <span className="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-2xl bg-gradient-to-br from-[#009FD9] to-[#0078a8] text-white shadow-[0_16px_34px_rgba(0,159,217,0.38)] ring-[6px] ring-white group-hover:-translate-y-1 transition-transform duration-300">
                    <Icon className="h-7 w-7" />
                  </span>
                </div>

                {/* Elevated card */}
                <div className="relative w-full flex-1 overflow-hidden rounded-3xl bg-white border border-[#eef1f5] px-7 pt-7 pb-8 shadow-[0_12px_44px_rgba(16,39,68,0.07)] group-hover:shadow-[0_24px_60px_rgba(16,39,68,0.13)] group-hover:-translate-y-1.5 transition-all duration-300">
                  <span aria-hidden className="pointer-events-none absolute -right-1 -top-3 select-none text-[5.5rem] font-black leading-none tracking-tighter text-[#1a2744]/[0.045]">
                    {n}
                  </span>
                  <span className="relative inline-flex items-center gap-1.5 rounded-full bg-[#EBF5FB] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#009FD9]">
                    Paso {n}
                  </span>
                  <h3 className="relative mt-3 font-bold text-[#1a2744] text-lg">{title}</h3>
                  <p className="relative mt-2 text-sm text-gray-500 leading-relaxed">{desc}</p>
                </div>

                {/* Forward connector dot (desktop, between steps) */}
                {i < STEPS.length - 1 && (
                  <span aria-hidden className="hidden md:grid absolute -right-[0.95rem] top-[2.55rem] z-20 h-7 w-7 place-items-center rounded-full bg-white shadow-[0_4px_12px_rgba(16,39,68,0.14)] ring-1 ring-[#e6eef5]">
                    <ArrowRight className="h-3.5 w-3.5 text-[#009FD9]" />
                  </span>
                )}
              </div>
            </FadeInUp>
          ))}
        </div>
      </div>
    </section>
  );
}
