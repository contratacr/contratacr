import { Search, UserCheck, MessageCircle } from "lucide-react";

// "Contrata en tres pasos" — honest, no intermediaries framing. Presentation only.
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
    <section className="py-16 sm:py-20 bg-[#f4f7fa]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EBF5FB] text-[#009FD9] px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
            <span className="h-1.5 w-1.5 rounded-full bg-[#009FD9]" /> Así de fácil
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-[#1a2744]">
            Contrata en tres pasos
          </h2>
          <p className="text-gray-500 mt-2 max-w-xl mx-auto">
            Sin llamadas a ciegas ni intermediarios. Tú decides con quién trabajar.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {STEPS.map(({ n, Icon, title, desc }) => (
            <div
              key={n}
              className="relative rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_4px_18px_rgba(0,0,0,0.04)] hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-shadow"
            >
              <div className="flex items-start justify-between mb-5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#EBF5FB] text-[#009FD9] text-sm font-extrabold">
                  {n}
                </span>
                <Icon className="h-5 w-5 text-[#9ca3af]" />
              </div>
              <h3 className="font-bold text-[#1a2744] text-lg mb-1.5">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
