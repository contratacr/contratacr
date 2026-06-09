"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { MapPin, ArrowRight, Loader2, Navigation } from "lucide-react";
import { PROVINCES, getProvinceById } from "@/lib/data/cr-geography";
import type { ZoneCoverage } from "@/lib/queries/professionals";

// "Encuentra profesionales en tu zona" — province tabs + REAL cantón coverage.
// Honesty rule: the count and the cantón chips reflect only zones that genuinely
// have at least one listed professional (computed server-side in getZoneCoverage).
// Never a hardcoded number; a zone with no pros shows an honest empty state.
export function FindByZone({ coverage }: { coverage: ZoneCoverage }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState(PROVINCES[0].id);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const province = getProvinceById(activeId)!;
  // Covered cantón ids for the active province: whole-country pros cover every
  // cantón; otherwise use the genuinely-covered set from the server.
  const coveredIds = coverage.countryWide
    ? province.cantons.map((c) => c.id)
    : coverage.byProvince[activeId] ?? [];
  const coveredSet = new Set(coveredIds);
  const coveredCantons = province.cantons.filter((c) => coveredSet.has(c.id));
  const count = coveredCantons.length;

  function goToProvince() {
    router.push(`/buscar?provincia=${activeId}`);
  }

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Tu navegador no permite ubicación. Elige tu provincia abajo.");
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setGeoLoading(false);
        router.push(`/buscar?sortBy=cercania&lat=${latitude.toFixed(5)}&lng=${longitude.toFixed(5)}`);
      },
      () => {
        setGeoLoading(false);
        setGeoError("No pudimos obtener tu ubicación. Elige tu provincia abajo.");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }

  return (
    <section className="relative py-16 sm:py-24 overflow-hidden bg-[#EBF5FB]">
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 bottom-0 w-[36%]"
        style={{ background: "rgba(255,255,255,0.45)", borderRadius: "50% 0 0 50%", zIndex: 0 }}
      />

      <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white text-[#009FD9] px-3 py-1 text-[11px] font-bold uppercase tracking-wide shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[#009FD9]" /> Cobertura local
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-[#1a2744]">
            Encuentra profesionales en tu zona
          </h2>
          <p className="text-gray-500 mt-2 max-w-xl mx-auto">
            Elige tu provincia, afina por cantón o deja que te ubiquemos. Profesionales cerca de ti, en distintas zonas del país.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] rounded-3xl overflow-hidden shadow-[0_20px_60px_rgba(26,39,68,0.16)]">
          {/* ── Left: location helper (dark) ── */}
          <div className="bg-[#1a2744] p-7 flex flex-col">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 text-[#7dd3fc] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
              <span className="h-1.5 w-1.5 rounded-full bg-[#38bdf8]" /> ¿Dónde lo necesitas?
            </span>
            <h3 className="mt-4 text-2xl font-extrabold text-white leading-tight">
              Resultados cerca de ti
            </h3>
            <p className="mt-2 text-sm text-white/60 leading-relaxed">
              Filtra por ubicación para mostrarte a quienes trabajan en tu área.
            </p>

            <button
              type="button"
              onClick={useMyLocation}
              disabled={geoLoading}
              className="mt-5 inline-flex items-center gap-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 px-4 py-3 text-left transition-colors disabled:opacity-60"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#009FD9] text-white">
                {geoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-white">Usar mi ubicación</span>
                <span className="block text-[11px] text-white/55">Te mostramos lo más cercano</span>
              </span>
            </button>
            {geoError && <p className="mt-2 text-[11px] text-amber-200/90">{geoError}</p>}

            <p className="mt-auto pt-5 text-[11px] text-white/45 leading-relaxed">
              No prometemos cobertura en todo el país: te mostramos solo a quienes realmente trabajan en tu zona.
            </p>
          </div>

          {/* ── Right: province tabs + cantones ── */}
          <div className="bg-white p-7">
            <div className="flex flex-wrap gap-2 mb-6">
              {PROVINCES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveId(p.id)}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                    p.id === activeId
                      ? "bg-[#EBF5FB] text-[#009FD9] ring-1 ring-[#bfe3f5]"
                      : "text-[#6b7280] hover:bg-[#f3f4f6]"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="h-5 w-5 text-[#009FD9] shrink-0" />
                <span className="text-xl font-extrabold text-[#1a2744] truncate">{province.name}</span>
              </div>
              <button
                type="button"
                onClick={goToProvince}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[#009FD9] hover:bg-[#0089bb] px-4 py-2 text-sm font-bold text-white transition-colors"
              >
                Ver profesionales
              </button>
            </div>

            {count > 0 ? (
              <>
                <p className="text-[13px] text-[#6b7280] mb-5">
                  {count} {count === 1 ? "cantón con cobertura" : "cantones con cobertura"} · elige el tuyo para afinar la búsqueda
                </p>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] mb-2.5">Cantones con profesionales</p>
                <div className="flex flex-wrap gap-2 mb-6">
                  {coveredCantons.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => router.push(`/buscar?provincia=${activeId}&canton=${c.id}`)}
                      className="px-3.5 py-1.5 rounded-full border border-[#e5e7eb] bg-white text-sm font-medium text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] transition-colors"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={goToProvince}
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-[#009FD9] hover:underline"
                >
                  Ver todos los profesionales en {province.name} <ArrowRight className="h-4 w-4" />
                </button>
              </>
            ) : (
              <div className="mt-2 rounded-xl bg-[#f9fafb] border border-[#e5e7eb] p-5">
                <p className="text-sm font-semibold text-[#374151]">Aún no hay profesionales en {province.name}.</p>
                <p className="text-[13px] text-[#6b7280] mt-1">
                  Estamos creciendo zona por zona. Prueba otra provincia o explora todos los profesionales disponibles.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/buscar")}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-[#009FD9] hover:underline"
                >
                  Ver todos los profesionales <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
