import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { PROVINCES } from "@/lib/data/cr-geography";

// The 7 provinces = the country's zones. Each chip pre-filters the search by
// province. We intentionally do NOT claim coverage in every zone.
export function TrustedProvinces() {
  return (
    <section className="relative py-20 sm:py-24 overflow-hidden bg-[#EBF5FB]">
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-[40%]"
        style={{ background: "rgba(255,255,255,0.5)", borderRadius: "0 50% 50% 0", zIndex: 0 }}
      />

      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744] mb-2">
          Encuentra profesionales en tu zona
        </h2>
        <p className="text-gray-500 text-base mb-10 max-w-lg mx-auto">
          Elige tu provincia y descubre los profesionales disponibles en tu área.
        </p>

        {/* Province pills → /buscar?provincia=<id> */}
        <div className="flex flex-wrap justify-center gap-2.5 mb-8">
          {PROVINCES.map((province) => (
            <Link
              key={province.id}
              href={`/buscar?provincia=${province.id}`}
              className="px-5 py-2 rounded-full border border-gray-300 bg-white text-sm font-semibold text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] transition-all duration-150 shadow-sm"
            >
              {province.name}
            </Link>
          ))}
        </div>

        <Link
          href="/buscar"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[#009FD9] hover:underline"
        >
          Ver todos los profesionales <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
