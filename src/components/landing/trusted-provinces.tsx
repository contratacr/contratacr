import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";

const PROVINCES = [
  "San José",
  "Alajuela",
  "Cartago",
  "Heredia",
  "Guanacaste",
  "Puntarenas",
  "Limón",
];

/* Major cantons to show as secondary */
const CANTONS = [
  "Desamparados", "Alajuelita", "Escazú", "Santa Ana", "Curridabat",
  "Liberia", "Pérez Zeledón", "Ciudad Quesada",
];

export function TrustedProvinces() {
  return (
    <section className="py-20 sm:py-24 bg-[#f4f7fa]">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">

        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744] mb-2">
          Profesionales en toda Costa Rica.
        </h2>
        <p className="text-gray-400 text-base mb-10">
          No te preocupés por encontrar un pro — cubrimos cada provincia y cantón del país.
        </p>

        {/* Province pills */}
        <div className="flex flex-wrap justify-center gap-2.5 mb-5">
          {PROVINCES.map((province) => (
            <Link
              key={province}
              href={`/buscar?provincia=${encodeURIComponent(province)}`}
              className="px-4 py-2 rounded-full border border-gray-300 text-sm font-medium text-[#374151] hover:border-[#2563EB] hover:text-[#2563EB] hover:bg-[#EBF5FB] transition-all duration-150"
            >
              {province}
            </Link>
          ))}
        </div>

        {/* Canton pills (smaller) */}
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

        {/* Find your zone CTA */}
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
