"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { sectionIcon } from "@/lib/visuals/section-visuals";
import { DIRECTORY_SECTION_LABELS } from "@/lib/search/directory-search";
import { useRouter } from "@/i18n/navigation";
import { MapPin, ArrowRight, Loader2, Navigation } from "lucide-react";
import { PROVINCES, getProvinceById } from "@/lib/data/cr-geography";
import { CR_PROVINCE_PATHS, CR_MAP_VIEWBOX } from "@/lib/data/cr-map-paths";
import type { ZoneCoverage } from "@/lib/queries/professionals";
import { rutaDeBusqueda } from "@/lib/buscar-url";
import { useSiteFeatures } from "@/components/site-features";

const leadIconClass = "grid shrink-0 place-items-center rounded-xl border border-[#ccecf8] bg-[#EAF7FD] text-[#0089bb] shadow-[0_8px_20px_-18px_rgba(0,159,217,0.9)]";

// "Encuentra profesionales en tu zona" — an interactive map of Costa Rica.
// Click a province on the map → it highlights and the panel shows its cantones
// + REAL coverage (computed server-side; never a fabricated count).
const ZONE_SECTIONS = ["restaurantes", "farmacias", "supermercados", "gasolineras", "cafes", "talleres", "ferreterias", "belleza", "veterinarias"];

export function FindByZone({ coverage, companies = null, pros = null }: { coverage: ZoneCoverage; companies?: Record<string, number> | null; pros?: Record<string, number> | null }) {
  const t = useTranslations("landing.zones");
  const { directorySections } = useSiteFeatures();
  const directoryOn = directorySections.length > 0;
  const locale = useLocale();
  const router = useRouter();
  const [activeId, setActiveId] = useState(PROVINCES[0].id);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  // Directory on (owner 2026-11-26): the panel shows professionals or companies of the province.
  const [kind, setKind] = useState<"pros" | "companies">("pros");
  // Directory on: keeps the selected province name visible in the scrollable row under the map.
  const provinceRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = provinceRow.current;
    const pill = row?.querySelector<HTMLElement>(`[data-province="${activeId}"]`);
    if (!row || !pill || row.scrollWidth <= row.clientWidth) return;
    const left = pill.offsetLeft - (row.clientWidth - pill.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [activeId]);

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
        router.push(directoryOn && kind === "companies" ? `/restaurantes?lat=${latitude.toFixed(2)}&lng=${longitude.toFixed(2)}&sort=distance` : `/profesionales?lat=${latitude.toFixed(5)}&lng=${longitude.toFixed(5)}`);
      },
      () => {
        setGeoLoading(false);
        setGeoError(t("geoFailed"));
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }

  // Directory on (owner 2026-11-26): a simpler block. The map is the star; under it, one card for the chosen province with
  // its counts and two buttons. "Cerca de mí" sits on the title row, like the other home sections.
  if (directoryOn) {
    const prosHere = pros?.[province.id] ?? 0;
    const placesHere = companies?.[province.id] ?? 0;
    return (
      <section data-zone-simple className="bg-white px-4 pb-8 pt-5 sm:pb-14 sm:pt-7">
        <div className="mx-auto max-w-6xl">
          {/* Owner 2026-11-26: a title that says what to do; «Cerca de mí» lives in the search at the top. */}
          <h2 className="mb-4 text-center text-[22px] font-extrabold leading-tight text-[#1a2744] sm:mb-6 sm:text-3xl">{t("headingDirectory")}</h2>
          <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[1.3fr_1fr] lg:gap-12">
            <div className="min-w-0">
            <svg viewBox={CR_MAP_VIEWBOX} className="mx-auto h-auto w-full max-w-[560px] drop-shadow-[0_18px_40px_rgba(16,39,68,0.12)]" role="group" aria-label={t("mapAria")}>
              {PROVINCES.map((p) => (
                <path key={p.id} d={CR_PROVINCE_PATHS[p.id]} fill={fill(p.id)} stroke="#ffffff" strokeWidth={2}
                  className="cursor-pointer transition-[fill] duration-200 focus:outline-none"
                  style={{ filter: p.id === activeId ? "drop-shadow(0 4px 10px rgba(0,159,217,0.4))" : undefined }}
                  onClick={() => setActiveId(p.id)}
                  onMouseEnter={() => setHoverId(p.id)}
                  onMouseLeave={() => setHoverId((h) => (h === p.id ? null : h))}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveId(p.id); } }}
                  role="button" aria-label={p.name} aria-pressed={p.id === activeId}>
                  <title>{p.name}</title>
                </path>
              ))}
            </svg>
            {/* Province names under the map (2026-11-27): Heredia and Cartago are small targets on a phone map. */}
            <div ref={provinceRow} data-zone-province-row className="relative -mx-4 mt-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
              {/* w-max + mx-auto: centred when the seven names fit, scrollable when they do not. */}
              <div className="mx-auto flex w-max gap-1.5">
              {PROVINCES.map((p) => (
                <button key={p.id} type="button" data-province={p.id} onClick={() => setActiveId(p.id)} aria-pressed={p.id === activeId}
                  className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${p.id === activeId
                    ? "border-[#009FD9] bg-[#009FD9] text-white"
                    : "border-[#d7e1ea] bg-white text-[#334155] hover:border-[#9fd3ea]"}`}>
                  {p.name}
                </button>
              ))}
              </div>
            </div>
            </div>
            <div className="text-center" data-zone-card>
              <div className="flex items-center justify-center gap-2">
                <MapPin className="h-5 w-5 shrink-0 text-[#009FD9]" aria-hidden />
                <span className="text-[20px] font-extrabold leading-tight text-[#1a2744]" aria-live="polite">{province.name}</span>
              </div>
              {/* The two real numbers of the province are the way in (owner 2026-11-26): tap one to see them. */}
              <div className="mx-auto mt-4 grid max-w-sm grid-cols-2 gap-2.5" data-zone-counts>
                <button type="button" onClick={goToProvince} data-zone-pros
                  className="flex flex-col items-center rounded-2xl bg-[#eaf7fd] px-3 py-3 transition-colors hover:bg-[#dff1fa]">
                  <span className="text-[24px] font-extrabold leading-none text-[#162543]">{prosHere.toLocaleString("es-CR")}</span>
                  <span className="mt-1 inline-flex items-center gap-1 text-[13px] font-bold text-[#0083b0]">{t("prosWord", { count: prosHere })}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></span>
                </button>
                <button type="button" onClick={() => router.push("/categorias?vista=negocios")} data-zone-places
                  className="flex flex-col items-center rounded-2xl bg-[#eaf7fd] px-3 py-3 transition-colors hover:bg-[#dff1fa]">
                  <span className="text-[24px] font-extrabold leading-none text-[#162543]">{placesHere.toLocaleString("es-CR")}</span>
                  <span className="mt-1 inline-flex items-center gap-1 text-[13px] font-bold text-[#0083b0]">{t("placesWord", { count: placesHere })}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden bg-white pb-10 pt-5 sm:pb-14 sm:pt-7">
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-7 text-center sm:mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744]">
            {directoryOn ? t("headingDirectory") : t("heading")}
          </h2>
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
          <div className="rounded-3xl bg-white border border-[#eef2f6] p-7 sm:p-8 shadow-[0_18px_50px_rgba(16,39,68,0.10)]">
            {directoryOn && (
              <div role="tablist" aria-label={t("kindLabel")} className="-mx-7 -mt-7 mb-5 grid grid-cols-2 border-b border-[#eef2f6] sm:-mx-8 sm:-mt-8" data-zone-kind>
                {(["pros", "companies"] as const).map((k) => (
                  <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} data-zone-kind-option={k}
                    className={`relative h-12 text-[15px] font-bold transition-colors ${kind === k ? "text-[#009FD9] after:absolute after:inset-x-6 after:bottom-0 after:h-[3px] after:rounded-full after:bg-[#009FD9]" : "text-[#6b7686]"}`}>
                    {k === "pros" ? t("kindPros") : t("kindCompanies")}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
              <div className="flex items-center gap-2.5">
                <span className={`${leadIconClass} h-11 w-11`}>
                  <MapPin className="h-5 w-5" />
                </span>
                <div>
                  {/* Province name has priority — never truncate it. */}
                  <span className="block text-xl font-extrabold text-[#1a2744] leading-tight">{province.name}</span>
                  {/* Each tab says only its own count (owner 2026-11-26). */}
                  {directoryOn && kind === "companies" ? (
                    <span className="block text-[12px] font-semibold text-[#0089bb]" data-zone-companies-count>{t("companiesCount", { count: companies?.[province.id] ?? 0 })}</span>
                  ) : count > 0 ? (
                    <span className="block text-[12px] font-semibold text-[#0089bb]">
                      {directoryOn && pros && (pros[province.id] ?? 0) > 0 && <>{t("prosCount", { count: pros[province.id] })} · </>}
                      {t("coverageCount", { count })}
                    </span>
                  ) : (
                    <span className="block text-[12px] font-medium text-[#68778d]">{t("noPros")}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={directoryOn && kind === "companies" ? () => router.push(`/categorias`) : goToProvince}
                className="w-full sm:w-auto shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] px-4 py-2.5 text-sm font-bold text-white transition-colors shadow-[0_8px_22px_rgba(0,159,217,0.3)]"
              >
                {directoryOn && kind === "companies" ? t("viewCompaniesAll") : t("viewPros")} <ArrowRight className="h-4 w-4" />
              </button>
            </div>


            {directoryOn && kind === "companies" ? (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#68778d] mb-3">{t("companiesIn", { province: province.name })}</p>
                <div className="mb-6 grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3" data-zone-company-sections>
                  {ZONE_SECTIONS.filter((id) => directorySections.includes(id)).map((id) => {
                    const Icon = sectionIcon(id);
                    return (
                      <button key={id} type="button" onClick={() => router.push(`/${id}?province=${encodeURIComponent(province.name)}`)}
                        className="flex min-w-0 items-center gap-1.5 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-left text-sm font-medium leading-tight text-[#374151] hover:border-[#009FD9] hover:bg-[#EBF5FB] hover:text-[#0089bb] transition-colors">
                        <Icon className="h-4 w-4 shrink-0 text-[#009FD9]" aria-hidden />
                        <span className="truncate">{(DIRECTORY_SECTION_LABELS[id] as Record<string, string> | undefined)?.[locale] ?? DIRECTORY_SECTION_LABELS[id]?.es}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : count > 0 ? (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#68778d] mb-3">{t("cantonsWithPros")}</p>
                {/* Todos los cantones, en cuadrícula pareja y por orden alfabético. */}
                <div className="mb-6 grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3">
                  {[...coveredCantons].sort((x, y) => x.name.localeCompare(y.name, "es")).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => router.push(rutaDeBusqueda({ provincia: activeId, canton: c.id }))}
                      className="group flex min-w-0 items-center gap-1.5 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-left text-sm font-medium leading-tight text-[#374151] hover:border-[#009FD9] hover:bg-[#EBF5FB] hover:text-[#0089bb] transition-colors"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#009FD9]" />
                      {c.name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-2xl bg-white border border-[#e5e7eb] p-5 mb-6">
                <p className="text-sm font-semibold text-[#374151]">{t("emptyTitle", { province: province.name })}</p>
                <p className="text-[13px] text-[#6b7280] mt-1">
                  {t("emptyDesc")}
                </p>
              </div>
            )}

            {/* Geolocation + disclaimer */}
            <div className="border-t border-[#eef2f6] pt-5">
              <button
                type="button"
                onClick={useMyLocation}
                disabled={geoLoading}
                className="inline-flex items-center gap-2.5 rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm font-bold text-[#1a2744] hover:border-[#009FD9] hover:text-[#009FD9] transition-colors disabled:opacity-60"
              >
                <span className={`${leadIconClass} h-7 w-7 rounded-lg`}>
                  {geoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                </span>
                {t("useLocation")}
              </button>
              {geoError && <p className="mt-2 text-[12px] text-[#b45309]">{geoError}</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
