"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Search, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PROVINCES } from "@/lib/data/cr-geography";
import { ALL_CATEGORIES, searchCategories } from "@/lib/data/categories";

// Flat location index: provinces + every canton (with its province).
type LocationItem = { label: string; provinceId: string; cantonId?: string };
const LOCATIONS: LocationItem[] = [
  ...PROVINCES.map((p) => ({ label: p.name, provinceId: p.id })),
  ...PROVINCES.flatMap((p) => p.cantons.map((c) => ({ label: c.name, provinceId: p.id, cantonId: c.id }))),
];

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

export function HeroSearch() {
  const router = useRouter();
  const t = useTranslations();

  // Free text for both fields. The service text is sent literally (as q) and
  // also resolved to a category when it matches. Location resolves to
  // province/canton on submit (canton auto-fills its province).
  const [service, setService] = useState("");
  const [serviceCat, setServiceCat] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [locSel, setLocSel] = useState<LocationItem | null>(null);
  const [openSvc, setOpenSvc] = useState(false);
  const [openLoc, setOpenLoc] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const svcSuggestions = useMemo(() => (service.trim() ? searchCategories(service).slice(0, 6) : ALL_CATEGORIES.slice(0, 6)), [service]);
  const locSuggestions = useMemo(() => {
    const q = normalize(location);
    return (q ? LOCATIONS.filter((l) => normalize(l.label).includes(q)) : LOCATIONS).slice(0, 8);
  }, [location]);

  function resolveLocation(text: string): LocationItem | null {
    if (locSel && normalize(locSel.label) === normalize(text)) return locSel;
    const q = normalize(text);
    if (!q) return null;
    return LOCATIONS.find((l) => normalize(l.label) === q) ?? LOCATIONS.find((l) => normalize(l.label).includes(q)) ?? null;
  }

  // Search runs ONLY here (Enter or "Buscar") — selecting a suggestion just fills.
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();

    // Service → category id when it matches, else free-text query.
    const svc = service.trim();
    if (serviceCat) params.set("categoria", serviceCat);
    else if (svc) {
      const exact = ALL_CATEGORIES.find((c) => normalize(c.label) === normalize(svc));
      if (exact) params.set("categoria", exact.id);
      else params.set("q", svc);
    }

    // Location → auto-detect canton's province (e.g. "Atenas" → Alajuela + Atenas).
    const loc = resolveLocation(location);
    if (loc) {
      params.set("provincia", loc.provinceId);
      if (loc.cantonId) params.set("canton", loc.cantonId);
    } else if (location.trim()) {
      // Unmatched location → fall back to a text search so nothing is lost.
      if (!params.has("q")) params.set("q", `${svc} ${location.trim()}`.trim());
    }

    router.push(`/buscar?${params.toString()}`);
  }

  const inputCls =
    "w-full h-12 rounded-xl border-0 bg-[#f3f4f6] pl-9 pr-3 text-sm text-[#111827] placeholder:text-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#009FD9]";

  return (
    <form ref={formRef} onSubmit={handleSearch} className="w-full max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-[#e5e7eb] p-3 flex flex-col sm:flex-row gap-2">
        {/* Service */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280] pointer-events-none" />
          <input
            value={service}
            onChange={(e) => { setService(e.target.value); setServiceCat(null); setOpenSvc(true); }}
            onFocus={() => setOpenSvc(true)}
            onBlur={() => setTimeout(() => setOpenSvc(false), 150)}
            placeholder={t("hero.categoryPlaceholder")}
            className={inputCls}
          />
          {openSvc && svcSuggestions.length > 0 && (
            <ul className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-xl border border-[#e5e7eb] bg-white shadow-lg py-1">
              {svcSuggestions.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setService(c.label); setServiceCat(c.id); setOpenSvc(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-[#374151] hover:bg-[#EBF5FB]"
                  >
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="hidden sm:block w-px bg-[#e5e7eb] my-1" />

        {/* Location */}
        <div className="relative sm:w-52">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280] pointer-events-none" />
          <input
            value={location}
            onChange={(e) => { setLocation(e.target.value); setLocSel(null); setOpenLoc(true); }}
            onFocus={() => setOpenLoc(true)}
            onBlur={() => setTimeout(() => setOpenLoc(false), 150)}
            placeholder={t("hero.provincePlaceholder")}
            className={inputCls}
          />
          {openLoc && locSuggestions.length > 0 && (
            <ul className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-xl border border-[#e5e7eb] bg-white shadow-lg py-1">
              {locSuggestions.map((l) => (
                <li key={`${l.provinceId}-${l.cantonId ?? "prov"}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setLocation(l.label); setLocSel(l); setOpenLoc(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-[#374151] hover:bg-[#EBF5FB] flex items-center justify-between"
                  >
                    <span>{l.label}</span>
                    {l.cantonId && <span className="text-xs text-[#9ca3af]">{PROVINCES.find((p) => p.id === l.provinceId)?.name}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button type="submit" size="lg" className="h-12 px-8 shrink-0">
          {t("hero.searchButton")}
        </Button>
      </div>
    </form>
  );
}
