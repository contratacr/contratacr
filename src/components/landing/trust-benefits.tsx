import { ShieldCheck, Star, LifeBuoy } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";

// Client-facing trust benefits (NOT technical features). No invented numbers.
const PILLARS = [
  {
    Icon: ShieldCheck,
    title: "Identidad verificada",
    desc: "Confirmamos la identidad de cada profesional contra los registros oficiales.",
  },
  {
    Icon: Star,
    title: "Reseñas reales",
    desc: "Solo quienes recibieron un servicio pueden dejar una reseña.",
  },
  {
    Icon: WhatsAppIcon,
    title: "Coordina fácil por WhatsApp",
    desc: "Hablas directo con el profesional, sin intermediarios.",
  },
  {
    Icon: LifeBuoy,
    title: "Soporte cuando lo necesites",
    desc: "Te ayudamos por ticket o WhatsApp si algo no sale como esperabas.",
  },
];

export function TrustBenefits() {
  return (
    <section className="py-16 sm:py-20 bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744]">
            Contrata con tranquilidad
          </h2>
          <p className="text-gray-500 mt-2 max-w-xl mx-auto">
            Hecho para que encontrar y contratar a la persona correcta sea simple y confiable.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PILLARS.map(({ Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-[#e5e7eb] bg-white p-6">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]">
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
