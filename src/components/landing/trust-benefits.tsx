import { ShieldCheck, Star, LifeBuoy } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";

// Client-facing trust benefits (NOT technical features). No invented numbers.
// Each pillar carries its own brand-appropriate tint so the row reads warmly.
const PILLARS = [
  {
    Icon: ShieldCheck,
    title: "Identidad verificada",
    desc: "Confirmamos la identidad de cada profesional contra los registros oficiales del país.",
    tint: "bg-[#dcfce7] text-[#16a34a]",
  },
  {
    Icon: Star,
    title: "Reseñas reales",
    desc: "Solo quienes recibieron un servicio pueden dejar una reseña. Sin opiniones inventadas.",
    tint: "bg-[#fef3c7] text-[#d97706]",
  },
  {
    Icon: WhatsAppIcon,
    title: "Coordina por WhatsApp",
    desc: "Hablas directo con el profesional, sin intermediarios y a tu propio ritmo.",
    tint: "bg-[#dcfce7] text-[#16a34a]",
  },
  {
    Icon: LifeBuoy,
    title: "Soporte cuando lo necesites",
    desc: "Te ayudamos por ticket o WhatsApp si algo no sale como esperabas. Estamos para apoyarte.",
    tint: "bg-[#EBF5FB] text-[#009FD9]",
  },
];

export function TrustBenefits() {
  return (
    <section className="py-16 sm:py-20 bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EBF5FB] text-[#009FD9] px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
            <span className="h-1.5 w-1.5 rounded-full bg-[#009FD9]" /> Confianza
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-[#1a2744]">
            Contrata con tranquilidad
          </h2>
          <p className="text-gray-500 mt-2 max-w-xl mx-auto">
            Hecho para que encontrar y contratar a la persona correcta sea simple, transparente y seguro.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PILLARS.map(({ Icon, title, desc, tint }) => (
            <div key={title} className="rounded-2xl border border-[#e5e7eb] bg-white p-6 hover:shadow-[0_10px_30px_rgba(0,0,0,0.07)] transition-shadow">
              <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${tint}`}>
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-[#1a2744] mb-1.5 leading-snug">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
