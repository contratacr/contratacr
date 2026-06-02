import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";

const PROVINCES = ["San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón"];
const CANTONS   = ["Desamparados", "Alajuelita", "Escazú", "Santa Ana", "Curridabat", "Liberia", "Pérez Zeledón", "Ciudad Quesada"];

export function TrustedProvinces() {
  return (
    <section className="relative py-20 sm:py-24 overflow-hidden bg-[#EBF5FB]">
      {/* Decorative white arc — left side */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-[40%]"
        style={{ background: "rgba(255,255,255,0.5)", borderRadius: "0 50% 50% 0", zIndex: 0 }}
      />

      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744] mb-2">
          Profesionales en toda Costa Rica.
        </h2>
        <p className="text-gray-500 text-base mb-10 max-w-lg mx-auto">
          No te preocupés por encontrar un profesional — cubrimos cada provincia y cantón del país.
        </p>

        {/* Province pills */}
        <div className="flex flex-wrap justify-center gap-2.5 mb-4">
          {PROVINCES.map((province) => (
            <Link
              key={province}
              href={`/buscar?provincia=${encodeURIComponent(province)}`}
              className="px-5 py-2 rounded-full border border-gray-300 bg-white text-sm font-semibold text-[#374151] hover:border-[#2563EB] hover:text-[#2563EB] hover:bg-white transition-all duration-150 shadow-sm"
            >
              {province}
            </Link>
          ))}
        </div>

        {/* Canton pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {CANTONS.map((canton) => (
            <Link
              key={canton}
              href={`/buscar?canton=${encodeURIComponent(canton)}`}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-gray-400 hover:text-[#2563EB] transition-colors"
            >
              {canton}
            </Link>
          ))}
        </div>

        <Link
          href="/buscar"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[#2563EB] hover:underline"
        >
          Encontrá profesionales en tu zona <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
