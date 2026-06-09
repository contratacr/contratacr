import { Link } from "@/i18n/navigation";
import { Plus, ShieldCheck, MessageCircle } from "lucide-react";
import { SmartRegisterLink } from "@/components/layout/smart-register-link";

// "Haz crecer tu negocio" — professional recruitment CTA. Honest claims only:
// ContrataCR is free with no commissions; verified profiles rank first; clients
// contact directly. CTA is session-aware via SmartRegisterLink.
const PERKS = [
  { Icon: Plus, title: "100% gratis", desc: "Sin comisiones ni cargos ocultos." },
  { Icon: ShieldCheck, title: "Destácate con tu verificación", desc: "Los perfiles verificados aparecen primero." },
  { Icon: MessageCircle, title: "Clientes que te contactan directo", desc: "Coordina por WhatsApp, sin intermediarios." },
];

export function GrowBusinessCta() {
  return (
    <section className="py-16 sm:py-20 bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-[#1a2744] p-8 sm:p-12">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(0,159,217,0.35), transparent 70%)" }}
          />
          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            {/* Left: pitch + CTAs */}
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 text-[#7dd3fc] px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
                <span className="h-1.5 w-1.5 rounded-full bg-[#38bdf8]" /> Para profesionales
              </span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-white leading-tight">
                Haz crecer tu negocio con ContrataCR
              </h2>
              <p className="mt-3 text-white/65 leading-relaxed max-w-md">
                Crea tu perfil gratis, recibe solicitudes de clientes de tu zona y coordina directo. Sin comisiones ni cargos de ningún tipo.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <SmartRegisterLink className="inline-flex items-center justify-center rounded-xl bg-[#009FD9] hover:bg-[#0089bb] px-6 py-3 text-sm font-bold text-white transition-colors">
                  Registrarse como profesional
                </SmartRegisterLink>
                <Link
                  href="/como-funciona"
                  className="inline-flex items-center justify-center rounded-xl bg-white hover:bg-white/90 px-6 py-3 text-sm font-bold text-[#1a2744] transition-colors"
                >
                  Cómo funciona
                </Link>
              </div>
            </div>

            {/* Right: perks */}
            <div className="flex flex-col gap-3">
              {PERKS.map(({ Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-4 rounded-2xl bg-white/5 border border-white/10 p-4">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#7dd3fc]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-white text-[15px]">{title}</p>
                    <p className="text-[13px] text-white/55">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
