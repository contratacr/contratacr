import { Link } from "@/i18n/navigation";
import { Plus, ShieldCheck, MessageCircle, ArrowRight } from "lucide-react";
import { SmartRegisterLink } from "@/components/layout/smart-register-link";
import { AppPhone } from "@/components/landing/app-phone";
import { FadeInUp } from "@/components/landing/fade-in-up";

// "Haz crecer tu negocio" — professional recruitment CTA as a product showcase:
// a fixed phone mockup of the REAL app beside the pitch. Honest claims only
// (free, no commissions; verified ranks first; clients contact directly).
const PERKS = [
  { Icon: Plus, title: "100% gratis", desc: "Sin comisiones ni cargos ocultos." },
  { Icon: ShieldCheck, title: "Destácate con tu verificación", desc: "Los perfiles verificados aparecen primero." },
  { Icon: MessageCircle, title: "Clientes que te contactan directo", desc: "Coordina por WhatsApp, sin intermediarios." },
];

export function GrowBusinessCta() {
  return (
    <section className="relative overflow-hidden bg-[#111a2e] py-20 sm:py-28">
      {/* Layered depth: brand glow + faint grid wash */}
      <div aria-hidden className="pointer-events-none absolute -left-32 top-1/4 h-[28rem] w-[28rem] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(0,159,217,0.30), transparent 70%)" }} />
      <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 h-[24rem] w-[24rem] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(56,189,248,0.16), transparent 70%)" }} />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-10 items-center">
          {/* Left: pitch + perks + CTAs */}
          <FadeInUp>
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 text-[#7dd3fc] px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
                <span className="h-1.5 w-1.5 rounded-full bg-[#38bdf8]" /> Para profesionales
              </span>
              <h2 className="mt-4 text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-white leading-[1.1]">
                Haz crecer tu negocio con <span className="text-[#38bdf8]">ContrataCR</span>
              </h2>
              <p className="mt-4 text-white/65 leading-relaxed max-w-md">
                Crea tu perfil gratis, recibe solicitudes de clientes de tu zona y coordina directo. Sin comisiones ni cargos de ningún tipo.
              </p>

              <div className="mt-7 space-y-2.5">
                {PERKS.map(({ Icon, title, desc }) => (
                  <div key={title} className="flex items-start gap-3.5 rounded-2xl bg-white/[0.06] border border-white/10 p-3.5 backdrop-blur-sm">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#009FD9]/20 text-[#7dd3fc]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-white text-[14px]">{title}</p>
                      <p className="text-[12.5px] text-white/55">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                <SmartRegisterLink className="inline-flex items-center gap-1.5 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] px-6 py-3 text-sm font-bold text-white transition-colors shadow-[0_10px_30px_rgba(0,159,217,0.35)]">
                  Registrarse como profesional <ArrowRight className="h-4 w-4" />
                </SmartRegisterLink>
                <Link
                  href="/como-funciona"
                  className="inline-flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 px-6 py-3 text-sm font-bold text-white transition-colors"
                >
                  Cómo funciona
                </Link>
              </div>
            </div>
          </FadeInUp>

          {/* Right: fixed phone mockup of the real app */}
          <FadeInUp delay={120}>
            <div className="relative flex justify-center lg:justify-end">
              <div aria-hidden className="pointer-events-none absolute inset-0 m-auto h-72 w-72 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(0,159,217,0.22), transparent 70%)" }} />
              <AppPhone className="relative" />
            </div>
          </FadeInUp>
        </div>
      </div>
    </section>
  );
}
