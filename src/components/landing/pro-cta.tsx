import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";

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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center rounded-3xl overflow-hidden bg-[#EBF5FB] border border-blue-100/60 p-8 sm:p-12 lg:p-16">

          {/* Decorative background accent */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 -right-32 w-80 h-80 rounded-full"
            style={{ background: "rgba(37,99,235,0.06)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-20 left-1/3 w-56 h-56 rounded-full"
            style={{ background: "rgba(37,99,235,0.04)" }}
          />

          {/* Left — Text */}
          <div className="relative">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#009FD9] bg-[#009FD9]/10 px-3 py-1.5 rounded-full mb-4">
              Para profesionales
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-[2.6rem] font-extrabold text-[#1a2744] leading-tight mb-4">
              Consigue clientes y haz crecer tu negocio
            </h2>
            <p className="text-gray-400 text-base sm:text-lg leading-relaxed mb-8 max-w-md">
              Miles de personas en Costa Rica buscan profesionales como tú. Registra tu perfil hoy y empieza a recibir consultas.
            </p>

            {/* Benefits grid */}
            <div className="grid grid-cols-2 gap-3 mb-10">
              {BENEFITS.map((b) => (
                <div
                  key={b.label}
                  className="flex items-center gap-2.5 bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm"
                >
                  <span className="text-lg">{b.icon}</span>
                  <span className="text-sm font-medium text-[#374151]">{b.label}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <Link
              href="/registro/profesional"
              className="inline-flex items-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold text-base px-8 py-4 rounded-2xl transition-all duration-150 active:scale-[0.97] shadow-[0_4px_24px_rgba(37,99,235,0.3)] hover:shadow-[0_8px_32px_rgba(37,99,235,0.45)]"
            >
              Registra tu perfil gratis
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>

          {/* Right — Photo */}
          <div className="relative hidden lg:block">
            <div
              className="relative rounded-2xl overflow-hidden shadow-2xl"
              style={{ height: 440 }}
            >
              <Image
                src="https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=800&q=80"
                alt="Profesional ContrataCR"
                fill
                className="object-cover"
                sizes="(min-width:1024px) 40vw, 0vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1a2744]/30 to-transparent" />
            </div>

            {/* Floating badge */}
            <div className="absolute -bottom-4 -left-6 bg-white rounded-2xl shadow-xl p-4 flex items-center gap-3 border border-gray-100">
              <div className="w-10 h-10 rounded-xl bg-[#009FD9]/10 flex items-center justify-center text-xl">
                ✅
              </div>
              <div>
                <p className="text-sm font-bold text-[#1a2744]">Verificado con cédula</p>
                <p className="text-xs text-gray-400">Confianza garantizada</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
