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
    <section className="py-16 sm:py-20 px-4 bg-[#1a2744] text-center">
      <div className="mx-auto max-w-2xl">
        <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#93C5FD] bg-white/10 px-3 py-1.5 rounded-full mb-4">
          Para profesionales
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight mb-3">
          Consigue clientes y haz crecer tu negocio
        </h2>
        <p className="text-[#93c5fd] text-sm sm:text-base leading-relaxed mb-8 max-w-xl mx-auto">
          Miles de personas en Costa Rica buscan profesionales como tú. Registra tu perfil hoy y empieza a recibir consultas directas por WhatsApp.
        </p>

        <div className="flex flex-wrap justify-center gap-2.5 mb-8 max-w-2xl mx-auto">
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

        <SmartRegisterLink className="inline-flex items-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold text-base px-8 py-3.5 rounded-2xl transition-colors">
          Registra tu perfil gratis
          <ArrowRight className="h-5 w-5" />
        </SmartRegisterLink>
      </div>
    </section>
  );
}
