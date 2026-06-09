import { ArrowRight } from "lucide-react";
import { SmartRegisterLink } from "@/components/layout/smart-register-link";

const BENEFITS = [
  { icon: "👤", label: "Perfil 100% gratis" },
  { icon: "💬", label: "Clientes directos por WhatsApp" },
  { icon: "🚫", label: "Sin comisiones" },
  { icon: "✅", label: "Verificación con cédula" },
  { icon: "🎛️", label: "Control total de tu agenda" },
  { icon: "📍", label: "Visible en tu cantón" },
];

export function ProCTASection() {
  return (
    <section className="py-20 sm:py-28 bg-white overflow-hidden">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-[#1a2744] px-6 py-12 sm:px-12 sm:py-16 text-center">
          {/* Decorative brand glow */}
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#009FD9]/20" />
          <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-24 h-72 w-72 rounded-full bg-[#009FD9]/10" />

          <div className="relative">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#93C5FD] bg-white/10 px-3 py-1.5 rounded-full mb-4">
              Para profesionales
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight mb-3">
              Consigue clientes y haz crecer tu negocio
            </h2>
            <p className="text-white/60 text-base sm:text-lg leading-relaxed mb-8 max-w-xl mx-auto">
              Miles de personas en Costa Rica buscan profesionales como tú. Registra tu perfil hoy y empieza a recibir consultas directas por WhatsApp.
            </p>

            <div className="flex flex-wrap justify-center gap-2.5 mb-9 max-w-2xl mx-auto">
              {BENEFITS.map((b) => (
                <span
                  key={b.label}
                  className="inline-flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-3.5 py-1.5 text-sm font-medium text-white/90"
                >
                  <span>{b.icon}</span>
                  {b.label}
                </span>
              ))}
            </div>

            <SmartRegisterLink className="inline-flex items-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold text-base px-8 py-4 rounded-2xl transition-all duration-150 active:scale-[0.97] shadow-[0_8px_32px_rgba(0,159,217,0.45)]">
              Registra tu perfil gratis
              <ArrowRight className="h-5 w-5" />
            </SmartRegisterLink>
          </div>
        </div>
      </div>
    </section>
  );
}
