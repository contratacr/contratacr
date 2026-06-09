import { ShieldCheck, Star, LifeBuoy } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { FadeInUp } from "@/components/landing/fade-in-up";

// Client-facing trust benefits (NOT technical features). No invented numbers.
// Each pillar gets a prominent colored icon tile + matching glow for presence.
const PILLARS = [
  {
    Icon: ShieldCheck,
    title: "Identidad verificada",
    desc: "Confirmamos la identidad de cada profesional contra los registros oficiales del país.",
    tile: "bg-gradient-to-br from-[#16a34a] to-[#15803d]",
    glow: "rgba(22,163,74,0.18)",
    accent: "#16a34a",
  },
  {
    Icon: Star,
    title: "Reseñas reales",
    desc: "Solo quienes recibieron un servicio pueden dejar una reseña. Sin opiniones inventadas.",
    tile: "bg-gradient-to-br from-[#f59e0b] to-[#d97706]",
    glow: "rgba(245,158,11,0.20)",
    accent: "#d97706",
  },
  {
    Icon: WhatsAppIcon,
    title: "Coordina por WhatsApp",
    desc: "Hablas directo con el profesional, sin intermediarios y a tu propio ritmo.",
    tile: "bg-gradient-to-br from-[#25D366] to-[#1da851]",
    glow: "rgba(37,211,102,0.18)",
    accent: "#1da851",
  },
  {
    Icon: LifeBuoy,
    title: "Soporte cuando lo necesites",
    desc: "Te ayudamos por ticket o WhatsApp si algo no sale como esperabas. Estamos para apoyarte.",
    tile: "bg-gradient-to-br from-[#009FD9] to-[#0078a8]",
    glow: "rgba(0,159,217,0.18)",
    accent: "#009FD9",
  },
];

export function TrustBenefits() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28 bg-gradient-to-b from-[#eef4f9] to-white">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white text-[#009FD9] px-3 py-1 text-[11px] font-bold uppercase tracking-wide shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[#009FD9]" /> Confianza
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-[#1a2744]">
            Contrata con tranquilidad
          </h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto">
            Hecho para que encontrar y contratar a la persona correcta sea simple, transparente y seguro.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PILLARS.map(({ Icon, title, desc, tile, glow, accent }, i) => (
            <FadeInUp key={title} delay={i * 110}>
              <div className="group relative h-full overflow-hidden rounded-3xl bg-white border border-[#eef1f5] p-7 shadow-[0_10px_40px_rgba(16,39,68,0.06)] hover:shadow-[0_22px_55px_rgba(16,39,68,0.14)] hover:-translate-y-2 transition-all duration-300">
                {/* Per-pillar accent: a top color bar + a soft glow behind the icon. */}
                <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
                <span aria-hidden className="pointer-events-none absolute -top-6 -left-6 h-28 w-28 rounded-full opacity-70" style={{ background: `radial-gradient(circle, ${glow}, transparent 70%)` }} />

                <div className={`relative mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg ${tile} group-hover:scale-105 transition-transform duration-300`}>
                  <Icon className="h-8 w-8" />
                </div>
                <h3 className="relative font-bold text-[#1a2744] text-lg mb-2 leading-snug">{title}</h3>
                <p className="relative text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            </FadeInUp>
          ))}
        </div>
      </div>
    </section>
  );
}
