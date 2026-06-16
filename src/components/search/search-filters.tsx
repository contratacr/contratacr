"use client";

import { useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Loader2, MapPin, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROVINCES, getCantonsByProvince, nearestProvinceId } from "@/lib/data/cr-geography";
import { CategorySearch } from "@/components/ui/category-search";
import { searchCategories, getCategoryLabel } from "@/lib/data/categories";
import { INSURERS } from "@/lib/data/insurers";
import { createClient } from "@/lib/supabase/client";

// Filter Select triggers keep a NEUTRAL border in every state. The shared Select
// shows a brand-blue focus-visible ring; after picking an option Radix returns
// focus to the trigger and that ring can "stick", looking like a colored/stuck
// border. We override it here (filters only) so selecting never leaves an ugly
// outline — the open dropdown + chevron are the affordance.
const FILTER_TRIGGER = "text-sm focus-visible:ring-0 focus-visible:border-[#e5e7eb]";

export function SearchFilters({ variant = "sidebar", hideSearch = false, hideHeader = false }: { variant?: "sidebar" | "chips"; hideSearch?: boolean; hideHeader?: boolean } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useTranslations("search");
  const locale = useLocale();

  const [query, setQuery] = useState(params.get("q") ?? "");
  // Service autocomplete for the sidebar text search (our categories taxonomy).
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchActive, setSearchActive] = useState(-1);
  const searchBlurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSug = useMemo(() => (query.trim().length >= 2 ? searchCategories(query).slice(0, 6) : []), [query]);
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
      // In CHIPS mode the search input lives in a SEPARATE component (MobileServiceSearch),
      // so take `q` from the URL — never from this instance's stale local `query` — to
      // avoid clobbering what the search bar set. The sidebar keeps using its own input.
      const vals = { q: variant === "chips" ? (params.get("q") ?? "") : query, categoria: category, provincia: province, canton, sortBy, aseguradora, verificados: verifiedOnly ? "1" : "", lat: params.get("lat") ?? "", lng: params.get("lng") ?? "", ...overrides };
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
    [query, category, province, canton, sortBy, aseguradora, verifiedOnly, params, router, pathname, variant]
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

  // ── MOBILE chips variant ──────────────────────────────────────────────────
  // A single horizontally-scrollable row of pill controls (NO vertical sidebar, NO
  // search input — that's the separate MobileServiceSearch). Reuses every handler above,
  // so the filtering/URL logic is identical; only the presentation differs.
  if (variant === "chips") {
    const pill = `${FILTER_TRIGGER} h-9 w-full rounded-full bg-white`;
    const toggleChip = (active: boolean) =>
      `shrink-0 inline-flex items-center gap-1.5 h-9 rounded-full border px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
        active ? "border-[#009FD9] bg-[#EBF5FB] text-[#0089bb]" : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#009FD9]"
      }`;
    return (
      <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-0.5">
        <div className="shrink-0 w-[170px]">
          <CategorySearch
            value={category && category !== "todas" ? category : ""}
            onChange={(id) => { setCategory(id); applyFilters({ categoria: id }); }}
            placeholder={t("filters.category")}
          />
        </div>
        <div className="shrink-0 w-[140px]">
          <Select value={province} onValueChange={(v) => { setProvince(v); setCanton(""); applyFilters({ provincia: v, canton: "" }); }}>
            <SelectTrigger className={pill}><SelectValue placeholder={t("filters.province")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">{t("filters.allProvinces")}</SelectItem>
              {PROVINCES.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="shrink-0 w-[140px]">
          <Select value={canton} onValueChange={(v) => { setCanton(v); applyFilters({ canton: v }); }} disabled={!province || cantons.length === 0}>
            <SelectTrigger className={pill}><SelectValue placeholder={!province ? t("filters.selectProvince") : t("filters.canton")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">{t("filters.allCantons")}</SelectItem>
              {cantons.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="shrink-0 w-[150px]">
          <Select value={sortBy} onValueChange={(v) => {
            setSortBy(v);
            if (v === "cercania" && !geoActive) { useMyLocation(); return; }
            applyFilters({ sortBy: v });
          }}>
            <SelectTrigger className={pill}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rating">{t("sort.rating")}</SelectItem>
              <SelectItem value="priceAsc">{t("sort.priceAsc")}</SelectItem>
              <SelectItem value="availability">{t("sort.availability")}</SelectItem>
              <SelectItem value="cercania">{t("sort.cercania")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="shrink-0 w-[170px]">
          <Select value={aseguradora || undefined} onValueChange={(v) => { setAseguradora(v); applyFilters({ aseguradora: v }); }}>
            <SelectTrigger className={pill}>
              <SelectValue placeholder={t("filters.anyInsurer")}>
                {aseguradora ? insurerOptions.find((i) => i.id === aseguradora)?.label : <span className="text-[#9ca3af]">{t("filters.anyInsurer")}</span>}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {insurerOptions.map((i) => <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <button type="button" onClick={useMyLocation} disabled={geoLoading} className={toggleChip(geoActive)}>
          {geoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
          {geoActive ? t("filters.nearMeActive") : t("filters.nearMe")}
        </button>
        <button type="button" onClick={() => { const v = !verifiedOnly; setVerifiedOnly(v); applyFilters({ verificados: v ? "1" : "" }); }} className={toggleChip(verifiedOnly)}>
          <ShieldCheck className="h-3.5 w-3.5" /> {t("filters.verifiedOnly")}
        </button>
        {activeCount > 0 && (
          <button type="button" onClick={clearAll} className="shrink-0 inline-flex items-center gap-1 h-9 rounded-full px-3 text-[13px] font-medium text-[#6b7280] hover:text-red-500 whitespace-nowrap">
            <X className="h-3.5 w-3.5" /> {t("filters.clear")}
          </button>
        )}
      </div>
    );
  }

  const fieldLabel = "mb-1 block text-[11px] font-semibold text-[#6b7280]";
  // `hideHeader` = rendered inside the mobile filter sheet, which supplies its own
  // chrome (title bar / padding) — so drop the card border/rounding/padding here.
  const inDrawer = hideHeader;
  return (
    <div className={inDrawer ? "" : "rounded-2xl border border-[#e5e7eb] bg-white p-4"}>
      {/* Header — "Filtros" + a live active-count, with an inline clear when any are on. */}
      {!hideHeader && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#111827]">{t("filters.title")}</h2>
          {activeCount > 0 && (
            <button onClick={clearAll} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#9ca3af] hover:text-red-500 transition-colors">
              <X className="h-3 w-3" /> {t("filters.clear")} ({activeCount})
            </button>
          )}
        </div>
      )}

      {/* Text search (omitted in the mobile sheet — the sheet header already has a search bar).
          Autocompletes against OUR categories taxonomy: picking a suggestion filters by
          `categoria`; free text still searches `q` on debounce/Enter. */}
      {!hideSearch && (
        <div className="relative mb-3 flex items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[#9ca3af]" />
          <input
            type="text"
            value={query}
            onChange={(e) => { handleQueryChange(e.target.value); setSearchActive(-1); setSearchOpen(true); }}
            onFocus={() => { if (searchSug.length > 0) setSearchOpen(true); }}
            onBlur={() => { searchBlurRef.current = setTimeout(() => setSearchOpen(false), 150); }}
            onKeyDown={(e) => {
              if (searchOpen && searchSug.length > 0) {
                if (e.key === "ArrowDown") { e.preventDefault(); setSearchActive((i) => Math.min(i + 1, searchSug.length - 1)); return; }
                if (e.key === "ArrowUp") { e.preventDefault(); setSearchActive((i) => Math.max(i - 1, 0)); return; }
                if (e.key === "Enter" && searchActive >= 0) {
                  e.preventDefault();
                  const s = searchSug[searchActive];
                  setCategory(s.id); setQuery(getCategoryLabel(s.id, locale)); setSearchOpen(false);
                  applyFilters({ categoria: s.id, q: "" });
                  return;
                }
                if (e.key === "Escape") { setSearchOpen(false); return; }
              }
              handleQueryKeyDown(e);
            }}
            placeholder={t("filters.searchPlaceholder")}
            role="combobox"
            aria-expanded={searchOpen}
            aria-autocomplete="list"
            className="w-full rounded-xl border border-[#e5e7eb] bg-[#f9fafb] py-2.5 pl-9 pr-9 text-sm text-[#111827] placeholder-[#9ca3af] transition focus:border-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
          />
          {query && (
            <button onClick={() => { clearQuery(); setSearchOpen(false); }} className="absolute right-3 text-[#9ca3af] hover:text-[#374151] transition-colors" aria-label={t("filters.clearSearch")}>
              <X className="h-4 w-4" />
            </button>
          )}
          {searchOpen && searchSug.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-72 overflow-auto rounded-xl border border-[#e5e7eb] bg-white py-1 shadow-xl" role="listbox">
              {searchSug.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === searchActive}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setCategory(s.id); setQuery(getCategoryLabel(s.id, locale)); setSearchOpen(false); applyFilters({ categoria: s.id, q: "" }); }}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors ${i === searchActive ? "bg-[#EBF5FB]" : "hover:bg-[#f9fafb]"}`}
                  >
                    <Search className="h-4 w-4 shrink-0 text-[#009FD9]" />
                    <span className="truncate text-[#374151]">{getCategoryLabel(s.id, locale)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Vertical stack — designed for the left sidebar (and the mobile drawer). */}
      <div className="flex flex-col gap-3">
        {/* Category — typeable + browsable list (with "¿No ves tu categoría?"). */}
        <div>
          <label className={fieldLabel}>{t("filters.category")}</label>
          <CategorySearch
            value={category && category !== "todas" ? category : ""}
            onChange={(id) => { setCategory(id); applyFilters({ categoria: id }); }}
            placeholder={t("filters.allCategories")}
          />
        </div>

        {/* Provincia + Cantón — FULL-WIDTH stacked, exactly like every other filter
            (Categoría / Ordenar / Aseguradora). The old 2-column row made each box too
            narrow for "Todas las provincias"/"Todos los cantones" (overflow) and put the
            disabled-Cantón faded border right next to Provincia — visually inconsistent. */}
        <div>
          <label className={fieldLabel}>{t("filters.province")}</label>
          <Select value={province} onValueChange={(v) => { setProvince(v); setCanton(""); applyFilters({ provincia: v, canton: "" }); }}>
            <SelectTrigger className={FILTER_TRIGGER}>
              <SelectValue placeholder={t("filters.allProvinces")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">{t("filters.allProvinces")}</SelectItem>
              {PROVINCES.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className={fieldLabel}>{t("filters.canton")}</label>
          <Select value={canton} onValueChange={(v) => { setCanton(v); applyFilters({ canton: v }); }} disabled={!province || cantons.length === 0}>
            <SelectTrigger className={FILTER_TRIGGER}>
              <SelectValue placeholder={!province ? t("filters.selectProvince") : t("filters.allCantons")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">{t("filters.allCantons")}</SelectItem>
              {cantons.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className={fieldLabel}>{t("filters.sortBy")}</label>
          <Select value={sortBy} onValueChange={(v) => {
            setSortBy(v);
            // "Cercanía" needs the user's coordinates — request geolocation if we
            // don't have them yet; otherwise apply directly.
            if (v === "cercania" && !geoActive) { useMyLocation(); return; }
            applyFilters({ sortBy: v });
          }}>
            <SelectTrigger className={FILTER_TRIGGER}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rating">{t("sort.rating")}</SelectItem>
              <SelectItem value="priceAsc">{t("sort.priceAsc")}</SelectItem>
              <SelectItem value="availability">{t("sort.availability")}</SelectItem>
              <SelectItem value="cercania">{t("sort.cercania")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className={fieldLabel}>{t("filters.insurer")}</label>
          {/* Non-filtering default: nothing selected shows "Cualquier aseguradora"
              (greyed, like a placeholder, so it reads as NOT an active filter — most
              pros don't work with insurers). Pick one to filter; X clears it. */}
          <div className="flex items-center gap-1.5">
            <Select value={aseguradora || undefined} onValueChange={(v) => { setAseguradora(v); applyFilters({ aseguradora: v }); }}>
              <SelectTrigger className={`${FILTER_TRIGGER} flex-1`}>
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

      {/* On/off filters → clean toggle ROWS (no bordered boxes): label left, switch
          right, the whole row a subtle hover target. A thin divider separates them. */}
      <div className="mt-3 flex flex-col gap-0.5 border-t border-[#f3f4f6] pt-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={geoLoading}
          className="inline-flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-2 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb] focus:outline-none focus-visible:bg-[#f9fafb]"
        >
          <span className="flex-1 text-left">{geoActive ? t("filters.nearMeActive") : t("filters.nearMe")}</span>
          {geoLoading ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#009FD9]" />
          ) : (
            <span className={`flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${geoActive ? "bg-[#009FD9]" : "bg-[#d1d5db]"}`}>
              <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${geoActive ? "translate-x-4" : "translate-x-0.5"}`} />
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => { const v = !verifiedOnly; setVerifiedOnly(v); applyFilters({ verificados: v ? "1" : "" }); }}
          className="inline-flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-2 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb] focus:outline-none focus-visible:bg-[#f9fafb]"
        >
          <span>{t("filters.verifiedOnly")}</span>
          <span className={`flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${verifiedOnly ? "bg-[#009FD9]" : "bg-[#d1d5db]"}`}>
            <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${verifiedOnly ? "translate-x-4" : "translate-x-0.5"}`} />
          </span>
        </button>

        {geoError && <span className="px-1.5 text-[11px] text-[#b45309]">{geoError}</span>}
      </div>
    </div>
  );
}

// ── MOBILE "Filtros" icon-button (in the single-line /buscar header) ──
// Compact icon-only trigger; dispatches `ccr:open-filters`, which `SearchResultsLayout`
// listens for to open the full-filter drawer. A brand-blue dot marks active filters.
export function MobileFiltersButton() {
  const t = useTranslations("search");
  const params = useSearchParams();
  const hasActive =
    !!params.get("categoria") || !!params.get("provincia") || !!params.get("canton") ||
    !!params.get("aseguradora") || params.get("verificados") === "1" || !!params.get("lat") ||
    (!!params.get("sortBy") && params.get("sortBy") !== "rating");
  return (
    <button
      type="button"
      aria-label={t("filters.title")}
      onClick={() => window.dispatchEvent(new CustomEvent("ccr:open-filters"))}
      className="relative shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#162543] shadow-sm active:scale-95 transition-transform"
    >
      <SlidersHorizontal className="h-[18px] w-[18px]" />
      {hasActive && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#008ce0]" />}
    </button>
  );
}

// ── MOBILE service-search bar (the "Busca un servicio…" field, pinned at the top) ──
// Self-contained: manages the `q` param (PRESERVING every other param), AND autocompletes
// against OUR professions/categories taxonomy (`searchCategories`) — typing shows matching
// services; picking one filters by `categoria` (clears `q`). Same debounced free-text search
// on Enter / blur. The taxonomy is the same one the "Categoría" filter + hero use.
export function MobileServiceSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useTranslations("search");
  const locale = useLocale();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suggestions = useMemo(() => (q.trim().length >= 2 ? searchCategories(q).slice(0, 6) : []), [q]);

  const pushQuery = useCallback((value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value.trim()) next.set("q", value); else next.delete("q");
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }, [params, router, pathname]);

  const pickCategory = useCallback((id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("categoria", id);
    next.delete("q");
    next.delete("page");
    setQ(getCategoryLabel(id, locale));
    setOpen(false);
    router.push(`${pathname}?${next.toString()}`);
  }, [params, router, pathname, locale]);

  function onChange(value: string) {
    setQ(value); setActive(-1); setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushQuery(value), 400);
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (open && suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" && active >= 0) { e.preventDefault(); pickCategory(suggestions[active].id); return; }
      if (e.key === "Escape") { setOpen(false); return; }
    }
    if (e.key === "Enter") { if (debounceRef.current) clearTimeout(debounceRef.current); setOpen(false); pushQuery(q); }
  }
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); if (blurRef.current) clearTimeout(blurRef.current); }, []);

  return (
    <div className="relative flex items-center">
      <Search className="absolute left-3 h-4 w-4 text-[#9ca3af] pointer-events-none" />
      <input
        type="text"
        value={q}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        onBlur={() => { blurRef.current = setTimeout(() => setOpen(false), 150); }}
        placeholder={t("filters.searchPlaceholder")}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className="w-full rounded-full border border-[#e5e7eb] bg-white py-2.5 pl-9 pr-9 text-sm text-[#111827] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition"
      />
      {q && (
        <button onClick={() => { setQ(""); setOpen(false); if (debounceRef.current) clearTimeout(debounceRef.current); pushQuery(""); }} className="absolute right-3 text-[#9ca3af] hover:text-[#374151] transition-colors" aria-label={t("filters.clearSearch")}>
          <X className="h-4 w-4" />
        </button>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-72 overflow-auto rounded-xl border border-[#e5e7eb] bg-white py-1 shadow-xl" role="listbox">
          {suggestions.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickCategory(s.id)}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors ${i === active ? "bg-[#EBF5FB]" : "hover:bg-[#f9fafb]"}`}
              >
                <Search className="h-4 w-4 shrink-0 text-[#009FD9]" />
                <span className="truncate text-[#374151]">{getCategoryLabel(s.id, locale)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
