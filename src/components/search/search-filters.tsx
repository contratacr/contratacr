"use client";

import { useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, ShieldCheck, MapPin, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROVINCES, getCantonsByProvince, nearestProvinceId } from "@/lib/data/cr-geography";
import { CATEGORY_GROUPS, getCategoryLabel } from "@/lib/data/categories";
import { INSURERS } from "@/lib/data/insurers";
import { createClient } from "@/lib/supabase/client";

export function SearchFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useTranslations("search");

  const [query, setQuery] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState(params.get("categoria") ?? "");
  const [province, setProvince] = useState(params.get("provincia") ?? "");
  const [canton, setCanton] = useState(params.get("canton") ?? "");
  const [sortBy, setSortBy] = useState(params.get("sortBy") ?? "rating");
  const [aseguradora, setAseguradora] = useState(params.get("aseguradora") ?? "");
  const [verifiedOnly, setVerifiedOnly] = useState(params.get("verificados") === "1");
  // Geolocation ("cerca de mí") — opt-in, requested only when the user taps the
  // control, never auto-popped. Denied/unavailable → text search still works.
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const geoActive = !!params.get("lat") && params.get("sortBy") === "cercania";

  // Official list = static INSURERS + admin-approved additions from the DB.
  const [insurerOptions, setInsurerOptions] = useState<{ id: string; label: string }[]>(INSURERS);
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.from("insurers").select("id, label").eq("approved", true);
        if (Array.isArray(data) && data.length) {
          const map = new Map(INSURERS.map((i) => [i.id, { id: i.id, label: i.label }]));
          for (const d of data) map.set(d.id as string, { id: d.id as string, label: d.label as string });
          setInsurerOptions(Array.from(map.values()));
        }
      } catch { /* static list still works */ }
    })();
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cantons = getCantonsByProvince(province);

  const applyFilters = useCallback(
    (overrides: Record<string, string> = {}) => {
      const next = new URLSearchParams();
      const vals = { q: query, categoria: category, provincia: province, canton, sortBy, aseguradora, verificados: verifiedOnly ? "1" : "", lat: params.get("lat") ?? "", lng: params.get("lng") ?? "", ...overrides };
      if (vals.q) next.set("q", vals.q);
      if (vals.categoria && vals.categoria !== "todas") next.set("categoria", vals.categoria);
      if (vals.provincia && vals.provincia !== "todas") next.set("provincia", vals.provincia);
      if (vals.canton && vals.canton !== "todos" && vals.provincia) next.set("canton", vals.canton);
      if (vals.sortBy && vals.sortBy !== "rating") next.set("sortBy", vals.sortBy);
      if (vals.aseguradora && vals.aseguradora !== "todas") next.set("aseguradora", vals.aseguradora);
      if (vals.verificados === "1") next.set("verificados", "1");
      // Carry the geolocation coords so changing another filter keeps proximity.
      if (vals.lat && vals.lng) { next.set("lat", vals.lat); next.set("lng", vals.lng); }
      router.push(`${pathname}?${next.toString()}`);
    },
    [query, category, province, canton, sortBy, aseguradora, verifiedOnly, params, router, pathname]
  );

  // Request geolocation on demand (item 11). Granted → proximity sort + autofill
  // the nearest provincia. Denied/unavailable → keep the text-based search.
  function useMyLocation() {
    if (geoActive) {
      // Toggle OFF — drop the proximity sort + coords, keep other filters.
      setGeoError(null);
      applyFilters({ sortBy: "rating", lat: "", lng: "" });
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Tu navegador no permite ubicación. Usá la búsqueda por provincia/cantón.");
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const pid = nearestProvinceId(latitude, longitude);
        if (pid) { setProvince(pid); setCanton(""); }
        setSortBy("cercania");
        setGeoLoading(false);
        applyFilters({ sortBy: "cercania", provincia: pid ?? "", canton: "", lat: String(latitude.toFixed(5)), lng: String(longitude.toFixed(5)) });
      },
      () => {
        setGeoLoading(false);
        setGeoError("No pudimos obtener tu ubicación. Podés buscar por provincia y cantón.");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters({ q: value }), 400);
  }

  function handleQueryKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      applyFilters({ q: query });
    }
  }

  function clearQuery() {
    setQuery("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    applyFilters({ q: "" });
  }

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  function clearAll() {
    setQuery(""); setCategory(""); setProvince(""); setCanton(""); setSortBy("rating"); setAseguradora(""); setVerifiedOnly(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    router.push(pathname);
  }

  const activeCount =
    (query ? 1 : 0) +
    [category, province, canton].filter((v) => v && v !== "todas" && v !== "todos").length;

  return (
    <div className="bg-white rounded-2xl border border-[#e5e7eb] p-3">
      {/* Text search */}
      <div className="mb-2.5">
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-[#9ca3af] pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleQueryKeyDown}
            placeholder="Buscá cualquier servicio…"
            className="w-full rounded-xl border border-[#e5e7eb] bg-white py-2 pl-9 pr-9 text-sm text-[#111827] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition"
          />
          {query && (
            <button onClick={clearQuery} className="absolute right-3 text-[#9ca3af] hover:text-[#374151] transition-colors" aria-label="Limpiar búsqueda">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Vertical stack — designed for the left sidebar (and the mobile drawer). */}
      <div className="flex flex-col gap-2.5">
        {/* Category — grouped select */}
        <div className="flex-1">
          <label className="text-xs font-medium text-[#6b7280] mb-1 block">{t("filters.category")}</label>
          <Select value={category} onValueChange={(v) => { setCategory(v); applyFilters({ categoria: v }); }}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder={t("filters.allCategories")}>
                {category && category !== "todas" ? getCategoryLabel(category) : t("filters.allCategories")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">{t("filters.allCategories")}</SelectItem>
              {CATEGORY_GROUPS.map((group) => (
                <div key={group.id} className="pb-1">
                  <div className="sticky top-0 z-10 bg-white px-2.5 py-1.5 mb-0.5 text-[10px] font-bold text-[#6b7280] uppercase tracking-widest border-b border-[#f3f4f6]">
                    {group.emoji} {group.label}
                  </div>
                  {group.items.map((item) => (
                    <SelectItem key={item.id} value={item.id} className="pl-4">
                      {item.label}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-[#6b7280] mb-1 block">{t("filters.province")}</label>
          <Select value={province} onValueChange={(v) => { setProvince(v); setCanton(""); applyFilters({ provincia: v, canton: "" }); }}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder={t("filters.allProvinces")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">{t("filters.allProvinces")}</SelectItem>
              {PROVINCES.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-[#6b7280] mb-1 block">{t("filters.canton")}</label>
          <Select value={canton} onValueChange={(v) => { setCanton(v); applyFilters({ canton: v }); }} disabled={!province || cantons.length === 0}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder={t("filters.allCantons")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">{t("filters.allCantons")}</SelectItem>
              {cantons.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-[#6b7280] mb-1 block">{t("filters.sortBy")}</label>
          <Select value={sortBy} onValueChange={(v) => { setSortBy(v); applyFilters({ sortBy: v }); }}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {geoActive && <SelectItem value="cercania">Cerca de mí</SelectItem>}
              <SelectItem value="rating">{t("sort.rating")}</SelectItem>
              <SelectItem value="reviews">{t("sort.reviews")}</SelectItem>
              <SelectItem value="priceAsc">{t("sort.priceAsc")}</SelectItem>
              <SelectItem value="priceDesc">{t("sort.priceDesc")}</SelectItem>
              <SelectItem value="newest">{t("sort.newest")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-[#6b7280] mb-1 block">Aseguradora</label>
          <Select value={aseguradora} onValueChange={(v) => { setAseguradora(v); applyFilters({ aseguradora: v }); }}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Todas">{aseguradora && aseguradora !== "todas" ? insurerOptions.find((i) => i.id === aseguradora)?.label : "Todas"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {insurerOptions.map((i) => <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Geolocation + verified toggles + clear */}
      <div className="mt-2.5 pt-2.5 border-t border-[#f3f4f6] flex flex-col gap-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={geoLoading}
          className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
            geoActive
              ? "bg-[#EBF5FB] border-[#bfdbfe] text-[#0089bb]"
              : "bg-white border-[#e5e7eb] text-[#374151] hover:border-[#009FD9]"
          }`}
        >
          {geoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
          {geoActive ? "Cerca de mí (activo)" : "Usar mi ubicación"}
        </button>

        <button
          type="button"
          onClick={() => { const v = !verifiedOnly; setVerifiedOnly(v); applyFilters({ verificados: v ? "1" : "" }); }}
          className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
            verifiedOnly
              ? "bg-[#dcfce7] border-[#bbf7d0] text-[#15803d]"
              : "bg-white border-[#e5e7eb] text-[#374151] hover:border-[#16a34a]"
          }`}
        >
          <span className={`flex h-3.5 w-6 items-center rounded-full transition-colors ${verifiedOnly ? "bg-[#16a34a]" : "bg-[#d1d5db]"}`}>
            <span className={`h-2.5 w-2.5 rounded-full bg-white transition-transform ${verifiedOnly ? "translate-x-3" : "translate-x-0.5"}`} />
          </span>
          <ShieldCheck className="h-3.5 w-3.5" />
          Solo identidad verificada
        </button>

        {geoError && <span className="text-xs text-[#b45309]">{geoError}</span>}
        {activeCount > 0 && (
          <button onClick={clearAll} className="inline-flex items-center justify-center gap-1 text-xs text-[#6b7280] hover:text-red-500 transition-colors pt-0.5">
            <X className="h-3 w-3" /> {t("filters.clear")} ({activeCount})
          </button>
        )}
      </div>
    </div>
  );
}
