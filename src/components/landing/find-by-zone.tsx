"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { MapPin, ArrowRight, Loader2, Navigation } from "lucide-react";
import { PROVINCES, getProvinceById } from "@/lib/data/cr-geography";
import { CR_PROVINCE_PATHS, CR_MAP_VIEWBOX } from "@/lib/data/cr-map-paths";
import type { ZoneCoverage } from "@/lib/queries/professionals";

// "Encuentra profesionales en tu zona" — an interactive map of Costa Rica.
// Click a province on the map → it highlights and the panel shows its cantones
// + REAL coverage (computed server-side; never a fabricated count).
export function FindByZone({ coverage }: { coverage: ZoneCoverage }) {
  const t = useTranslations("landing.zones");
  const router = useRouter();
  const [activeId, setActiveId] = useState(PROVINCES[0].id);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const province = getProvinceById(activeId)!;
  const hasCoverage = (id: string) => coverage.countryWide || (coverage.byProvince[id]?.length ?? 0) > 0;
  const coveredIds = coverage.countryWide
    ? province.cantons.map((c) => c.id)
    : coverage.byProvince[activeId] ?? [];
  const coveredSet = new Set(coveredIds);
  const coveredCantons = province.cantons.filter((c) => coveredSet.has(c.id));
  const count = coveredCantons.length;

  function fill(id: string) {
    if (id === activeId) return "#009FD9";
    if (id === hoverId) return "#93cde9";
    return hasCoverage(id) ? "#bfe3f5" : "#dbe4ee";
  }

  function goToProvince() {
    router.push(`/buscar?provincia=${activeId}`);
  }

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError(t("geoUnsupported"));
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
        setGeoError(t("geoFailed"));
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }

  return (
    <section className="relative py-20 sm:py-28 overflow-hidden bg-gradient-to-b from-white to-[#eef4f9]">
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EBF5FB] text-[#009FD9] px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
            <span className="h-1.5 w-1.5 rounded-full bg-[#009FD9]" /> {t("eyebrow")}
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-[#1a2744]">
            {t("heading")}
          </h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* ── Interactive map ── */}
          <div className="relative">
            <svg viewBox={CR_MAP_VIEWBOX} className="w-full h-auto drop-shadow-[0_18px_40px_rgba(16,39,68,0.12)]" role="group" aria-label={t("mapAria")}>
              {PROVINCES.map((p) => (
                <path
                  key={p.id}
                  d={CR_PROVINCE_PATHS[p.id]}
                  fill={fill(p.id)}
                  stroke="#ffffff"
                  strokeWidth={2}
                  className="cursor-pointer transition-[fill] duration-200 focus:outline-none"
                  style={{ filter: p.id === activeId ? "drop-shadow(0 4px 10px rgba(0,159,217,0.4))" : undefined }}
                  onClick={() => setActiveId(p.id)}
                  onMouseEnter={() => setHoverId(p.id)}
                  onMouseLeave={() => setHoverId((h) => (h === p.id ? null : h))}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveId(p.id); } }}
                  role="button"
                  aria-label={p.name}
                  aria-pressed={p.id === activeId}
                >
                  <title>{p.name}</title>
                </path>
              ))}
            </svg>

            {/* Province pills (also the touch-friendly selector under the map) */}
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {PROVINCES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveId(p.id)}
                  onMouseEnter={() => setHoverId(p.id)}
                  onMouseLeave={() => setHoverId((h) => (h === p.id ? null : h))}
                  className={`px-3 py-1 rounded-full text-[13px] font-semibold transition-all duration-150 ${
                    p.id === activeId
                      ? "bg-gradient-to-br from-[#009FD9] to-[#0089bb] text-white shadow-[0_6px_16px_rgba(0,159,217,0.32)]"
                      : "bg-white text-[#6b7280] ring-1 ring-[#e5e7eb] hover:text-[#009FD9] hover:ring-[#bfe3f5]"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* ── Active-province panel ── */}
          <div className="rounded-3xl bg-white border border-[#eef1f5] p-7 sm:p-8 shadow-[0_18px_50px_rgba(16,39,68,0.10)]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#EBF5FB] text-[#009FD9]">
                  <MapPin className="h-5 w-5" />
                </span>
                <div>
                  {/* Province name has priority — never truncate it. */}
                  <span className="block text-xl font-extrabold text-[#1a2744] leading-tight">{province.name}</span>
                  {count > 0 ? (
                    <span className="block text-[12px] font-semibold text-[#16a34a]">
                      {t("coverageCount", { count })}
                    </span>
                  ) : (
                    <span className="block text-[12px] font-medium text-[#9ca3af]">{t("noPros")}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={goToProvince}
                className="w-full sm:w-auto shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] px-4 py-2.5 text-sm font-bold text-white transition-colors shadow-[0_8px_22px_rgba(0,159,217,0.3)]"
              >
                {t("viewPros")} <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {count > 0 ? (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] mb-3">{t("cantonsWithPros")}</p>
                <div className="flex flex-wrap gap-2 mb-6">
                  {coveredCantons.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => router.push(`/buscar?provincia=${activeId}&canton=${c.id}`)}
                      className="group inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white pl-2.5 pr-3.5 py-1.5 text-sm font-medium text-[#374151] hover:border-[#009FD9] hover:bg-[#EBF5FB] hover:text-[#0089bb] transition-colors"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a] group-hover:bg-[#009FD9]" />
                      {c.name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-2xl bg-[#f9fafb] border border-[#e5e7eb] p-5 mb-6">
                <p className="text-sm font-semibold text-[#374151]">{t("emptyTitle", { province: province.name })}</p>
                <p className="text-[13px] text-[#6b7280] mt-1">
                  {t("emptyDesc")}
                </p>
              </div>
            )}

            {/* Geolocation + disclaimer */}
            <div className="border-t border-[#f1f3f5] pt-5">
              <button
                type="button"
                onClick={useMyLocation}
                disabled={geoLoading}
                className="inline-flex items-center gap-2.5 rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm font-bold text-[#1a2744] hover:border-[#009FD9] hover:text-[#009FD9] transition-colors disabled:opacity-60"
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EBF5FB] text-[#009FD9]">
                  {geoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                </span>
                {t("useLocation")}
              </button>
              {geoError && <p className="mt-2 text-[12px] text-[#b45309]">{geoError}</p>}
              <p className="mt-3 text-[11px] text-[#9ca3af] leading-relaxed">
                {t("disclaimer")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
