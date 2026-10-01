"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { MapPin, ArrowRight, Loader2, Navigation } from "lucide-react";
import { PROVINCES, getProvinceById } from "@/lib/data/cr-geography";
import { CR_PROVINCE_PATHS, CR_MAP_VIEWBOX } from "@/lib/data/cr-map-paths";
import type { ZoneCoverage } from "@/lib/queries/professionals";
import { rutaDeBusqueda } from "@/lib/buscar-url";

const leadIconClass = "grid shrink-0 place-items-center rounded-xl border border-[#ccecf8] bg-[#EAF7FD] text-[#0089bb] shadow-[0_8px_20px_-18px_rgba(0,159,217,0.9)]";

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
    router.push(rutaDeBusqueda({ provincia: activeId }));
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
        router.push(`/profesionales?lat=${latitude.toFixed(5)}&lng=${longitude.toFixed(5)}`);
      },
      () => {
        setGeoLoading(false);
        setGeoError(t("geoFailed"));
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }

  return (
    <section className="relative overflow-hidden bg-white py-10 sm:py-14">
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-7 text-center sm:mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744]">
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

          {/* ── Panel de la provincia: título, hasta 8 cantones en cuadrícula y
              las dos acciones juntas abajo. Con San José eran 20 píldoras
              sueltas y el panel no terminaba nunca. ── */}
          <div className="rounded-3xl border border-[#eef2f6] bg-white p-5 shadow-[0_18px_50px_rgba(16,39,68,0.10)] sm:p-7">
            <div className="flex items-center gap-3">
              <span className={`${leadIconClass} h-11 w-11 shrink-0`}>
                <MapPin className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <span className="block text-xl font-extrabold leading-tight text-[#1a2744]">{province.name}</span>
                <span className={`block text-[13px] font-semibold ${count > 0 ? "text-[#0089bb]" : "text-[#68778d]"}`}>
                  {count > 0 ? t("coverageCount", { count }) : t("noPros")}
                </span>
              </div>
            </div>

            {count > 0 ? (
              <div className="mt-5 grid grid-cols-2 gap-2">
                {coveredCantons.slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => router.push(rutaDeBusqueda({ provincia: activeId, canton: c.id }))}
                    className="flex min-w-0 items-center gap-2 rounded-xl bg-[#f5f8fb] px-3 py-2.5 text-left text-[14px] font-semibold text-[#1a2744] transition-colors hover:bg-[#e8f4fa] hover:text-[#0089bb]"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#009FD9]" />
                    <span className="min-w-0 break-words leading-tight">{c.name}</span>
                  </button>
                ))}
                {coveredCantons.length > 8 && (
                  <button type="button" onClick={goToProvince} className="col-span-2 rounded-xl px-3 py-2 text-[14px] font-bold text-[#009FD9] hover:underline">
                    {t("allCantons", { count: coveredCantons.length })}
                  </button>
                )}
              </div>
            ) : (
              <p className="mt-5 rounded-2xl bg-[#f5f8fb] p-4 text-[14px] leading-relaxed text-[#5b6778]">
                <span className="block font-semibold text-[#374151]">{t("emptyTitle", { province: province.name })}</span>
                {t("emptyDesc")}
              </p>
            )}

            <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
              <button
                type="button"
                onClick={goToProvince}
                className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-[#009FD9] px-4 text-[15px] font-bold text-white transition-colors hover:bg-[#0089bb]"
              >
                {t("viewPros")} <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={useMyLocation}
                disabled={geoLoading}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#dbe5ee] bg-white px-4 text-[15px] font-bold text-[#1a2744] transition-colors hover:border-[#009FD9] hover:text-[#009FD9] disabled:opacity-60"
              >
                {geoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                {t("useLocation")}
              </button>
            </div>
            {geoError && <p className="mt-2 text-[12px] text-[#b45309]">{geoError}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
