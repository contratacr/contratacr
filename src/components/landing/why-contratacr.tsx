import { Search, BadgeCheck, MessageCircle, LifeBuoy, ArrowRight } from "lucide-react";
import { PhoneFrame, ResultsScreen } from "@/components/landing/phone-screens";
import { SmartRegisterLink } from "@/components/layout/smart-register-link";
import { Link } from "@/i18n/navigation";
import { FadeInUp } from "@/components/landing/fade-in-up";

/* "Así funciona ContrataCR" — ONE phone (the best/most representative app
   screen) with all the key info organized beside it. Merges how-it-works,
   trust and the professional pitch. Monochrome icons (serious tone). */
const POINTS = [
  { Icon: Search, title: "Describe tu proyecto", desc: "Cuéntanos qué necesitas y dónde, en tus palabras. Sin llamadas a ciegas." },
  { Icon: BadgeCheck, title: "Profesionales verificados", desc: "Identidad confirmada contra los registros oficiales y reseñas reales de clientes." },
  { Icon: MessageCircle, title: "Coordina por WhatsApp", desc: "Hablas directo con el profesional para acordar fecha y precio, sin intermediarios." },
  { Icon: LifeBuoy, title: "Con soporte cuando lo necesites", desc: "Deja tu reseña al terminar y, si algo no sale bien, te ayudamos." },
];

export function WhyContratacr() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28 bg-white">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EBF5FB] text-[#009FD9] px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
            <span className="h-1.5 w-1.5 rounded-full bg-[#009FD9]" /> Cómo funciona
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-[#1a2744]">Así funciona ContrataCR</h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto">
            Para quienes buscan un profesional y para quienes ofrecen sus servicios. Simple, transparente y seguro.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Info */}
          <FadeInUp className="lg:order-1 order-2">
            <ul className="space-y-6">
              {POINTS.map(({ Icon, title, desc }) => (
                <li key={title} className="flex items-start gap-4">
                  <span className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3f4f6] text-[#1a2744]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-[#1a2744] leading-snug">{title}</p>
                    <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                  </div>
                </li>
              ))}
            </ul>

            {/* Professional pitch + CTA */}
            <div className="mt-8 rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] p-5">
              <p className="font-bold text-[#1a2744]">¿Ofreces servicios?</p>
              <p className="mt-1 text-sm text-gray-500 leading-relaxed">
                Crea tu perfil gratis y recibe solicitudes de clientes de tu zona. Sin comisiones, y los perfiles verificados aparecen primero.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <SmartRegisterLink className="inline-flex items-center gap-1.5 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] px-5 py-2.5 text-sm font-bold text-white transition-colors shadow-[0_10px_26px_rgba(0,159,217,0.3)]">
                  Registrarse como profesional <ArrowRight className="h-4 w-4" />
                </SmartRegisterLink>
                <Link href="/como-funciona" className="text-sm font-bold text-[#009FD9] hover:underline">Cómo funciona</Link>
              </div>
            </div>
          </FadeInUp>

          {/* One phone — the best/most representative screen */}
          <FadeInUp delay={120} className="lg:order-2 order-1">
            <div className="relative flex justify-center">
              <div aria-hidden className="pointer-events-none absolute -inset-10 -z-10 rounded-[3rem] bg-gradient-to-br from-[#EBF5FB] to-transparent opacity-70" />
              <PhoneFrame><ResultsScreen /></PhoneFrame>
            </div>
          </FadeInUp>
        </div>
      </div>
    </section>
  );
}
