import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { PROVINCES } from "@/lib/data/cr-geography";

// A handful of popular cantons (id-based so the search filters auto-populate).
const POPULAR_CANTONS = [
  "sj-de", "sj-al", "sj-es", "sj-sa", "sj-cu", "gu-li", "sj-pm", "al-sc",
];

const cantonLookup = PROVINCES.flatMap((p) =>
  p.cantons.map((c) => ({ ...c, provinceId: p.id }))
);

export function TrustedProvinces() {
  const cantons = POPULAR_CANTONS
    .map((id) => cantonLookup.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <section className="relative py-20 sm:py-24 overflow-hidden bg-[#EBF5FB]">
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
          No te preocupes por encontrar un profesional — cubrimos cada provincia y cantón del país.
        </p>

        {/* Province pills → /buscar?provincia=<id> */}
        <div className="flex flex-wrap justify-center gap-2.5 mb-4">
          {PROVINCES.map((province) => (
            <Link
              key={province.id}
              href={`/buscar?provincia=${province.id}`}
              className="px-5 py-2 rounded-full border border-gray-300 bg-white text-sm font-semibold text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] hover:bg-white transition-all duration-150 shadow-sm"
            >
              {province.name}
            </Link>
          ))}
        </div>

        {/* Canton pills → /buscar?provincia=<id>&canton=<id> */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {cantons.map((canton) => (
            <Link
              key={canton.id}
              href={`/buscar?provincia=${canton.provinceId}&canton=${canton.id}`}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-gray-400 hover:text-[#009FD9] transition-colors"
            >
              {canton.name}
            </Link>
          ))}
        </div>

        <Link
          href="/buscar"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[#009FD9] hover:underline"
        >
          Encuentra profesionales en tu zona <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
