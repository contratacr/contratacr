"use client";

import { useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROVINCES, getCantonsByProvince, nearestProvinceId } from "@/lib/data/cr-geography";
import { CategorySearch } from "@/components/ui/category-search";
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
  // The filter never offers a "Ninguna / Todas / sin seguros" entry — those are a
  // pro attribute or a stray placeholder, NOT a way to filter clients. Default is
  // simply no insurer selected (unfiltered). Excluded by id AND by label so a DB
  // row like "Ninguna" can't leak in regardless of its id.
  const NON_INSURER_ID = new Set(["ninguna", "none", "sin_seguros", "sin_seguro", "no_insurance", "todas", "todos", "all"]);
  const isRealInsurer = (i: { id: string; label: string }) =>
    !NON_INSURER_ID.has(i.id?.toLowerCase?.() ?? "") && !/^(ninguna|todas|todos|sin seguros?)$/i.test((i.label ?? "").trim());
  const [insurerOptions, setInsurerOptions] = useState<{ id: string; label: string }[]>(
    INSURERS.filter(isRealInsurer)
  );
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.from("insurers").select("id, label").eq("approved", true);
        if (Array.isArray(data) && data.length) {
          const map = new Map(INSURERS.map((i) => [i.id, { id: i.id, label: i.label }]));
          for (const d of data) map.set(d.id as string, { id: d.id as string, label: d.label as string });
          setInsurerOptions(Array.from(map.values()).filter(isRealInsurer));
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
      setGeoError(t("filters.geoUnsupported"));
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
        setGeoError(t("filters.geoFailed"));
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
    [category, province, canton].filter((v) => v && v !== "todas" && v !== "todos").length +
    (aseguradora ? 1 : 0) +
    (verifiedOnly ? 1 : 0) +
    (geoActive ? 1 : 0);

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
            placeholder={t("filters.searchPlaceholder")}
            className="w-full rounded-xl border border-[#e5e7eb] bg-white py-2 pl-9 pr-9 text-sm text-[#111827] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition"
          />
          {query && (
            <button onClick={clearQuery} className="absolute right-3 text-[#9ca3af] hover:text-[#374151] transition-colors" aria-label={t("filters.clearSearch")}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Vertical stack — designed for the left sidebar (and the mobile drawer). */}
      <div className="flex flex-col gap-2.5">
        {/* Category — typeable + browsable list (with "¿No ves tu categoría?"). */}
        <div className="flex-1">
          <label className="text-xs font-medium text-[#6b7280] mb-1 block">{t("filters.category")}</label>
          <CategorySearch
            value={category && category !== "todas" ? category : ""}
            onChange={(id) => { setCategory(id); applyFilters({ categoria: id }); }}
            placeholder={t("filters.allCategories")}
          />
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
          <Select value={sortBy} onValueChange={(v) => {
            setSortBy(v);
            // "Cercanía" needs the user's coordinates — request geolocation if we
            // don't have them yet; otherwise apply directly.
            if (v === "cercania" && !geoActive) { useMyLocation(); return; }
            applyFilters({ sortBy: v });
          }}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rating">{t("sort.rating")}</SelectItem>
              <SelectItem value="priceAsc">{t("sort.priceAsc")}</SelectItem>
              <SelectItem value="availability">{t("sort.availability")}</SelectItem>
              <SelectItem value="cercania">{t("sort.cercania")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-[#6b7280] mb-1 block">{t("filters.insurer")}</label>
          {/* Non-filtering default: nothing selected shows "Cualquier aseguradora"
              (greyed, like a placeholder, so it reads as NOT an active filter — most
              pros don't work with insurers). Pick one to filter; X clears it. */}
          <div className="flex items-center gap-1.5">
            <Select value={aseguradora || undefined} onValueChange={(v) => { setAseguradora(v); applyFilters({ aseguradora: v }); }}>
              <SelectTrigger className="text-sm flex-1">
                <SelectValue placeholder={t("filters.anyInsurer")}>
                  {aseguradora
                    ? insurerOptions.find((i) => i.id === aseguradora)?.label
                    : <span className="text-[#9ca3af]">{t("filters.anyInsurer")}</span>}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {insurerOptions.map((i) => <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {aseguradora && (
              <button
                type="button"
                onClick={() => { setAseguradora(""); applyFilters({ aseguradora: "" }); }}
                className="shrink-0 rounded-lg border border-[#e5e7eb] p-2 text-[#9ca3af] hover:text-[#374151] hover:border-[#009FD9] transition-colors"
                aria-label={t("filters.removeInsurer")}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* On/off filters → TOGGLES (booleans), distinct from the multi-choice
          dropdowns above. A small heading groups them so the panel reads as two
          coherent kinds: "choose a value" (dropdowns) vs "turn on/off" (toggles). */}
      <div className="mt-2.5 pt-2.5 border-t border-[#f3f4f6] flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af] mb-0.5">{t("filters.moreFilters")}</p>
        {/* Consistent toggle rows (label + on/off switch, no icons). */}
        <button
          type="button"
          onClick={useMyLocation}
          disabled={geoLoading}
          className="w-full inline-flex items-center justify-between gap-2 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-xs font-medium text-[#374151] hover:border-[#009FD9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9] transition-colors"
        >
          <span>{geoActive ? t("filters.nearMeActive") : t("filters.nearMe")}</span>
          {geoLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          ) : (
            <span className={`flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${geoActive ? "bg-[#009FD9]" : "bg-[#d1d5db]"}`}>
              <span className={`h-3 w-3 rounded-full bg-white transition-transform ${geoActive ? "translate-x-3.5" : "translate-x-0.5"}`} />
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => { const v = !verifiedOnly; setVerifiedOnly(v); applyFilters({ verificados: v ? "1" : "" }); }}
          className="w-full inline-flex items-center justify-between gap-2 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-xs font-medium text-[#374151] hover:border-[#009FD9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9] transition-colors"
        >
          <span>{t("filters.verifiedOnly")}</span>
          <span className={`flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${verifiedOnly ? "bg-[#009FD9]" : "bg-[#d1d5db]"}`}>
            <span className={`h-3 w-3 rounded-full bg-white transition-transform ${verifiedOnly ? "translate-x-3.5" : "translate-x-0.5"}`} />
          </span>
        </button>

        {geoError && <span className="text-xs text-[#b45309]">{geoError}</span>}
        {activeCount > 0 && (
          <button onClick={clearAll} className="inline-flex items-center justify-center gap-1 text-xs text-[#6b7280] hover:text-red-500 focus:outline-none focus-visible:underline transition-colors pt-0.5">
            <X className="h-3 w-3" /> {t("filters.clear")} ({activeCount})
          </button>
        )}
      </div>
    </div>
  );
}
