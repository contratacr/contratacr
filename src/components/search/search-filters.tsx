"use client";

import { useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Loader2, MapPin, SlidersHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { matchProvinceCanton, PROVINCES } from "@/lib/data/cr-geography";
import { CategorySearch } from "@/components/ui/category-search";
import { AnchoredDropdown } from "@/components/ui/anchored-dropdown";
import { searchCategories, getCategoryLabel, isHealthCategory, supportsVideoConsultCategory } from "@/lib/data/categories";
import { resolveLocation, searchLocations, type LocationSuggestion } from "@/lib/data/location-search";
import { INSURERS } from "@/lib/data/insurers";
import { LANGUAGES, languageLabel } from "@/lib/data/languages";
import { createClient } from "@/lib/supabase/client";
import { loadGoogleMaps } from "@/lib/maps/loader";
import { useCustomCategories } from "@/lib/data/use-custom-categories";

// Filter Select triggers stay on the ContrataCR blue system for focus/hover so
// the fields read the same whether a service filter is active or not.
const FILTER_TRIGGER = "text-sm";
// Open menu = EXACTLY the trigger's width, flush-aligned (left+right edges line up with
// the field) â€” like the "Servicio" autocomplete. By default Radix popper content sizes to
// its OPTIONS (with a min-w), so a short list (e.g. Aseguradora) opens narrower than its
// full-width trigger and misaligns. `--radix-select-trigger-width` is the trigger's width
// (exposed on popper content); `min-w-0` drops the shared `min-w-[8rem]` so the match is
// exact even for a narrow trigger. Filters only â€” the shared Select is untouched.
const FILTER_CONTENT = "min-w-0 w-[var(--radix-select-trigger-width)]";
// Sentinel for the in-dropdown "Cualquier aseguradora" reset item (Radix Select forbids
// an empty-string value, so we map this back to "" = no insurer filter).
const ANY_INSURER = "__any__";
const ANY_LANGUAGE = "__any_language__";
const ANY_MODALITY = "any";
const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

type AddressSuggestion = {
  type: "address";
  placeId: string;
  label: string;
  sublabel?: string;
};

type LocationOption = LocationSuggestion | AddressSuggestion;

function locationFilterLabel(provinceId: string, cantonId: string) {
  if (!provinceId || provinceId === "todas") return "";
  const province = PROVINCES.find((p) => p.id === provinceId);
  if (!province) return "";
  if (cantonId && cantonId !== "todos") {
    const canton = province.cantons.find((c) => c.id === cantonId);
    if (canton) return `${canton.name}, ${province.name}`;
  }
  return province.name;
}

function suggestionLabel(suggestion: LocationSuggestion) {
  return suggestion.type === "canton" ? `${suggestion.label}, ${suggestion.sublabel}` : suggestion.label;
}

function locationOptionLabel(suggestion: LocationOption) {
  if (suggestion.type === "address") return suggestion.sublabel ? `${suggestion.label}, ${suggestion.sublabel}` : suggestion.label;
  return suggestionLabel(suggestion);
}

function crOnlyLocationMessage(locale: string) {
  return locale === "en"
    ? "For now, locations can only be searched inside Costa Rica."
    : "Por ahora solo se pueden buscar ubicaciones dentro de Costa Rica.";
}

function isLikelyCostaRicaCoordinate(lat: number, lng: number) {
  // Generous bounds include Costa Rica mainland and Isla del Coco while rejecting
  // places from other countries if Google omits country address components.
  return lat >= 5 && lat <= 11.8 && lng >= -87.5 && lng <= -82;
}

function useSearchExamplePlaceholder(examples: string[], active: boolean) {
  const [text, setText] = useState(examples[0] ?? "");

  useEffect(() => {
    if (!active || examples.length === 0) return;

    let exampleIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      const phrase = examples[exampleIndex] ?? "";
      setText(phrase.slice(0, charIndex));

      if (!deleting && charIndex < phrase.length) {
        charIndex += 1;
        timer = setTimeout(tick, 48);
        return;
      }
      if (!deleting) {
        deleting = true;
        timer = setTimeout(tick, 1350);
        return;
      }
      if (charIndex > 0) {
        charIndex -= 1;
        timer = setTimeout(tick, 24);
        return;
      }
      deleting = false;
      exampleIndex = (exampleIndex + 1) % examples.length;
      timer = setTimeout(tick, 260);
    };

    timer = setTimeout(tick, 250);
    return () => { if (timer) clearTimeout(timer); };
  }, [active, examples]);

  return text;
}

type SearchFiltersInitialValues = {
  q?: string;
  categoria?: string;
  provincia?: string;
  canton?: string;
  sortBy?: string;
  modalidad?: string;
  aseguradora?: string;
  idioma?: string;
  ubicacion?: string;
  lat?: string;
  lng?: string;
};

type SearchFiltersProps = {
  variant?: "sidebar" | "chips";
  hideSearch?: boolean;
  hideHeader?: boolean;
  closable?: boolean;
  initialValues?: SearchFiltersInitialValues;
};

export function SearchFilters({ variant = "sidebar", hideSearch = false, hideHeader = false, closable = false, initialValues }: SearchFiltersProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useTranslations("search");
  const locale = useLocale();
  const customCategories = useCustomCategories();
  void customCategories;

  // ONE unified service control: the search field IS the category picker. Free text and a
  // picked category are MUTUALLY EXCLUSIVE (`q` XOR `categoria`), so on load we seed the
  // field from `q`, else from the active category's label (so arriving at ?categoria=X
  // shows "X" in the field instead of an empty box).
  const initialParam = useCallback((key: keyof SearchFiltersInitialValues) => params.get(key) ?? initialValues?.[key] ?? "", [initialValues, params]);
  const initialCategory = initialParam("categoria");
  const [query, setQuery] = useState(
    initialParam("q") || (initialCategory ? getCategoryLabel(initialCategory, locale) : "")
  );
  // Service autocomplete for the sidebar text search (our categories taxonomy).
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchActive, setSearchActive] = useState(-1);
  const searchBlurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchFieldRef = useRef<HTMLDivElement>(null);
  const searchSug = useMemo(() => (query.trim().length >= 2 ? searchCategories(query).slice(0, 6) : []), [query, customCategories]);
  const [category, setCategory] = useState(initialCategory);
  const [province, setProvince] = useState(initialParam("provincia"));
  const [canton, setCanton] = useState(initialParam("canton"));
  const [locationQuery, setLocationQuery] = useState(() =>
    initialParam("ubicacion")
      ? initialParam("ubicacion")
      : initialParam("lat") && initialParam("lng")
      ? t("filters.nearMeActive")
      : locationFilterLabel(initialParam("provincia"), initialParam("canton"))
  );
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationActiveIndex, setLocationActiveIndex] = useState(-1);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const locationBlurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationFieldRef = useRef<HTMLDivElement>(null);
  const mapsReadyRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionTokenRef = useRef<any>(null);
  const initialSort = initialParam("sortBy");
  const [sortBy, setSortBy] = useState(initialSort && initialSort !== "cercania" ? initialSort : "rating");
  const sortLabel = sortBy === "priceAsc"
    ? t("sort.priceAsc")
    : sortBy === "availability"
    ? t("sort.availability")
    : t("sort.rating");
  const [modality, setModality] = useState(initialParam("modalidad") || ANY_MODALITY);
  const [aseguradora, setAseguradora] = useState(() =>
    isHealthCategory(initialCategory) ? initialParam("aseguradora") : ""
  );
  const [language, setLanguage] = useState(initialParam("idioma"));
  // Geolocation ("cerca de mÃ­") â€” opt-in, requested only when the user taps the
  // control, never auto-popped. Denied/unavailable â†’ text search still works.
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const geoActive = !!params.get("lat") && !!params.get("lng");

  // Official list = static INSURERS + admin-approved additions from the DB.
  // The filter never offers a "Ninguna / Todas / sin seguros" entry â€” those are a
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

  useEffect(() => {
    if (!GMAPS_KEY) return;
    loadGoogleMaps(GMAPS_KEY).then(() => { mapsReadyRef.current = true; }).catch(() => {});
  }, []);

  useEffect(() => {
    const q = locationQuery.trim();
    if (q.length < 3) return;
    const id = setTimeout(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const maps = (window as any).google?.maps;
        if (!mapsReadyRef.current || !maps?.places?.AutocompleteSuggestion) {
          setAddressSuggestions([]);
          return;
        }
        if (!sessionTokenRef.current) sessionTokenRef.current = new maps.places.AutocompleteSessionToken();
        const { suggestions } = await maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          includedRegionCodes: ["cr"],
          sessionToken: sessionTokenRef.current,
        });
        const items: AddressSuggestion[] = (suggestions ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((s: any) => s.placePrediction)
          .filter(Boolean)
          .slice(0, 5)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((p: any) => {
            const full = (p.text?.text ?? p.text ?? "").toString();
            const main = (p.mainText?.text ?? "").toString();
            const secondary = (p.secondaryText?.text ?? "").toString();
            return {
              type: "address" as const,
              placeId: p.placeId,
              label: main || full,
              sublabel: secondary || (main && full && full !== main ? full : undefined),
            };
          })
          .filter((item: AddressSuggestion) => item.placeId && item.label);
        setAddressSuggestions(items);
      } catch {
        setAddressSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [locationQuery]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localLocationSug = useMemo(() => {
    const trimmed = locationQuery.trim();
    if (trimmed.length < 2) return [];
    return searchLocations(trimmed);
  }, [locationQuery]);
  const locationSug = useMemo<LocationOption[]>(() => {
    const includeAddresses = locationQuery.trim().length >= 3;
    const seen = new Set<string>();
    const options: LocationOption[] = [];
    for (const suggestion of localLocationSug) {
      seen.add(locationOptionLabel(suggestion).toLowerCase());
      options.push(suggestion);
    }
    if (includeAddresses) {
      for (const suggestion of addressSuggestions) {
        const key = locationOptionLabel(suggestion).toLowerCase();
        if (!seen.has(key)) options.push(suggestion);
      }
    }
    return options;
  }, [addressSuggestions, localLocationSug, locationQuery]);
  const areaActive = !!(params.get("n") && params.get("s") && params.get("e") && params.get("w"));
  const showInsurerFilter = isHealthCategory(category && category !== "todas" ? category : null);
  const showVideoFilter = supportsVideoConsultCategory(category && category !== "todas" ? category : null);

  const applyFilters = useCallback(
    (overrides: Record<string, string> = {}) => {
      const next = new URLSearchParams();
      // In CHIPS mode the search input lives in a SEPARATE component (MobileServiceSearch),
      // so take `q` from the URL â€” never from this instance's stale local `query` â€” to
      // avoid clobbering what the search bar set. The sidebar keeps using its own input.
      const vals = {
        q: variant === "chips" ? (params.get("q") ?? "") : query,
        categoria: category,
        provincia: province,
        canton,
        sortBy,
        modalidad: modality,
        aseguradora,
        idioma: language,
        lat: params.get("lat") ?? "",
        lng: params.get("lng") ?? "",
        ubicacion: params.get("ubicacion") ?? "",
        n: params.get("n") ?? "",
        s: params.get("s") ?? "",
        e: params.get("e") ?? "",
        w: params.get("w") ?? "",
        ...overrides,
      };
      const locationChanged =
        Object.prototype.hasOwnProperty.call(overrides, "provincia") ||
        Object.prototype.hasOwnProperty.call(overrides, "canton") ||
        Object.prototype.hasOwnProperty.call(overrides, "lat") ||
        Object.prototype.hasOwnProperty.call(overrides, "lng") ||
        Object.prototype.hasOwnProperty.call(overrides, "ubicacion");
      const hasSelectedCategory = !!(vals.categoria && vals.categoria !== "todas");
      if (vals.q && !hasSelectedCategory) next.set("q", vals.q);
      if (hasSelectedCategory) next.set("categoria", vals.categoria);
      if (vals.provincia && vals.provincia !== "todas") next.set("provincia", vals.provincia);
      if (vals.canton && vals.canton !== "todos" && vals.provincia) next.set("canton", vals.canton);
      if (vals.sortBy && vals.sortBy !== "rating") next.set("sortBy", vals.sortBy);
      if (showVideoFilter && vals.modalidad && vals.modalidad !== ANY_MODALITY) next.set("modalidad", vals.modalidad);
      if (isHealthCategory(vals.categoria) && vals.aseguradora && vals.aseguradora !== "todas") next.set("aseguradora", vals.aseguradora);
      if (vals.idioma && vals.idioma !== "todos") next.set("idioma", vals.idioma);
      // Carry the geolocation coords so changing another filter keeps proximity.
      if (vals.lat && vals.lng) { next.set("lat", vals.lat); next.set("lng", vals.lng); }
      if (vals.ubicacion && vals.lat && vals.lng) next.set("ubicacion", vals.ubicacion);
      // Keep "Buscar en esta area" active while changing service/sort/verified
      // filters. A province/canton or "cerca de mi" pick is a new location filter.
      if (!locationChanged && vals.n && vals.s && vals.e && vals.w) {
        next.set("n", vals.n);
        next.set("s", vals.s);
        next.set("e", vals.e);
        next.set("w", vals.w);
      }
      router.push(`${pathname}?${next.toString()}`);
    },
    [query, category, province, canton, sortBy, modality, aseguradora, language, params, router, pathname, variant, showVideoFilter]
  );

  // Request geolocation on demand (item 11). Granted â†’ proximity sort + autofill
  // the nearest provincia. Denied/unavailable â†’ keep the text-based search.
  function requestMyLocation(nextSortBy = sortBy) {
    if (geoActive) {
      // Toggle OFF â€” drop the proximity sort + coords, keep other filters.
      setGeoError(null);
      setLocationQuery("");
      const fallbackSort = sortBy === "cercania" ? "rating" : sortBy;
      if (sortBy === "cercania") setSortBy("rating");
      applyFilters({ sortBy: fallbackSort, lat: "", lng: "", ubicacion: "", provincia: "", canton: "" });
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
        setProvince("");
        setCanton("");
        setLocationQuery(t("filters.nearMeActive"));
        setGeoLoading(false);
        applyFilters({ sortBy: nextSortBy, provincia: "", canton: "", ubicacion: "", lat: String(latitude.toFixed(5)), lng: String(longitude.toFixed(5)) });
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
    // Free text supersedes any picked category (mutually exclusive).
    if (category) setCategory("");
    if (modality !== ANY_MODALITY) setModality(ANY_MODALITY);
    if (aseguradora) setAseguradora("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters({ q: value, categoria: "", aseguradora: "", modalidad: ANY_MODALITY }), 400);
  }

  function handleQueryKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setCategory("");
      setModality(ANY_MODALITY);
      setAseguradora("");
      applyFilters({ q: query, categoria: "", aseguradora: "", modalidad: ANY_MODALITY });
    }
  }

  // Picking a category suggestion â†’ set `categoria`, clear the free-text `q`, and cancel
  // any pending free-text debounce (so it can't fire afterward and wipe the category).
  function pickCategory(id: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const nextInsurer = isHealthCategory(id) ? aseguradora : "";
    const nextModality = supportsVideoConsultCategory(id) ? modality : ANY_MODALITY;
    setCategory(id);
    if (!nextInsurer) setAseguradora("");
    if (nextModality === ANY_MODALITY) setModality(ANY_MODALITY);
    setQuery(getCategoryLabel(id, locale));
    setSearchOpen(false);
    applyFilters({ categoria: id, q: "", aseguradora: nextInsurer, modalidad: nextModality });
  }

  function clearQuery() {
    setQuery(""); setCategory(""); setModality(ANY_MODALITY); setAseguradora("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    applyFilters({ q: "", categoria: "", aseguradora: "", modalidad: ANY_MODALITY });
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (locationBlurRef.current) clearTimeout(locationBlurRef.current);
    };
  }, []);

  function pickLocation(suggestion: LocationSuggestion) {
    const nextProvince = suggestion.type === "province" ? suggestion.id : suggestion.provinceId;
    const nextCanton = suggestion.type === "canton" ? suggestion.id : "";
    setProvince(nextProvince);
    setCanton(nextCanton);
    setLocationQuery(suggestionLabel(suggestion));
    setLocationOpen(false);
    setLocationActiveIndex(-1);
    setAddressSuggestions([]);
    applyFilters({ provincia: nextProvince, canton: nextCanton, lat: "", lng: "", ubicacion: "" });
  }

  async function pickAddress(suggestion: AddressSuggestion) {
    const label = locationOptionLabel(suggestion);
    setLocationQuery(label);
    setLocationOpen(false);
    setLocationActiveIndex(-1);
    setAddressSuggestions([]);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const maps = (window as any).google?.maps;
      if (!mapsReadyRef.current || !maps?.places?.Place) throw new Error("Google Places unavailable");
      const place = new maps.places.Place({ id: suggestion.placeId });
      await place.fetchFields({ fields: ["location", "addressComponents"] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const components: any[] = place.addressComponents ?? [];
      const pick = (type: string) => components.find((c) => c.types?.includes(type))?.longText as string | undefined;
      const pickShort = (type: string) => components.find((c) => c.types?.includes(type))?.shortText as string | undefined;
      const country = pick("country");
      const countryCode = pickShort("country");
      const countryLooksCostaRica = country ? /costa\s+rica/i.test(country) : false;
      const countryCodeLooksCostaRica = countryCode ? countryCode.toUpperCase() === "CR" : false;
      if ((country || countryCode) && !countryLooksCostaRica && !countryCodeLooksCostaRica) {
        setGeoError(crOnlyLocationMessage(locale));
        return;
      }
      const { provinceId, cantonId } = matchProvinceCanton(
        pick("administrative_area_level_1"),
        pick("administrative_area_level_2")
      );
      const lat = typeof place.location?.lat === "function" ? place.location.lat() : place.location?.lat;
      const lng = typeof place.location?.lng === "function" ? place.location.lng() : place.location?.lng;
      if (typeof lat === "number" && typeof lng === "number" && !isLikelyCostaRicaCoordinate(lat, lng)) {
        setGeoError(crOnlyLocationMessage(locale));
        return;
      }
      setGeoError(null);
      setProvince(provinceId ?? "");
      setCanton(cantonId ?? "");
      sessionTokenRef.current = null;
      if (typeof lat === "number" && typeof lng === "number") {
        applyFilters({
          provincia: provinceId ?? "",
          canton: cantonId ?? "",
          lat: String(lat.toFixed(5)),
          lng: String(lng.toFixed(5)),
          ubicacion: label,
        });
        return;
      }
      if (provinceId) {
        applyFilters({ provincia: provinceId, canton: cantonId ?? "", lat: "", lng: "", ubicacion: "" });
      }
    } catch {
      const fallback = resolveLocation(label);
      if (fallback) pickLocation(fallback);
    }
  }

  function pickLocationOption(suggestion: LocationOption) {
    if (suggestion.type === "address") {
      void pickAddress(suggestion);
      return;
    }
    pickLocation(suggestion);
  }

  function clearLocation() {
    setProvince("");
    setCanton("");
    setLocationQuery("");
    setLocationOpen(false);
    setLocationActiveIndex(-1);
    setAddressSuggestions([]);
    applyFilters({ provincia: "", canton: "", lat: "", lng: "", ubicacion: "" });
  }

  function handleLocationKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && locationSug.length > 0) {
      e.preventDefault();
      setLocationOpen(true);
      setLocationActiveIndex((i) => Math.min(i + 1, locationSug.length - 1));
      return;
    }
    if (e.key === "ArrowUp" && locationSug.length > 0) {
      e.preventDefault();
      setLocationActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Escape") {
      setLocationOpen(false);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = locationQuery.trim();
      if (!trimmed || /^costa\s+rica$/i.test(trimmed)) {
        clearLocation();
        return;
      }
      const selected = locationSug[locationActiveIndex >= 0 ? locationActiveIndex : 0] ?? resolveLocation(trimmed);
      if (selected) pickLocationOption(selected);
    }
  }

  function clearAll() {
    setQuery(""); setCategory(""); setProvince(""); setCanton(""); setLocationQuery(""); setSortBy("rating"); setModality(ANY_MODALITY); setAseguradora(""); setLanguage("");
    setAddressSuggestions([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    router.push(pathname);
  }

  // The unified service field (free text OR a picked category) counts as ONE filter â€” not
  // two â€” even though it's backed by `q` XOR `categoria`.
  const serviceActive = !!(query.trim() || (category && category !== "todas"));
  const locationDisplay = params.get("ubicacion") ?? (geoActive ? t("filters.nearMeActive") : locationFilterLabel(province, canton));
  const locationFilterActive = geoActive || !!locationDisplay;
  const activeCount =
    (serviceActive ? 1 : 0) +
    (locationFilterActive ? 1 : 0) +
    (showVideoFilter && modality !== ANY_MODALITY ? 1 : 0) +
    (areaActive ? 1 : 0) +
    (showInsurerFilter && aseguradora ? 1 : 0) +
    (language ? 1 : 0);

  // â”€â”€ MOBILE chips variant â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // A single horizontally-scrollable row of pill controls (NO vertical sidebar, NO
  // search input â€” that's the separate MobileServiceSearch). Reuses every handler above,
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
            onChange={(id) => {
              const nextInsurer = isHealthCategory(id) ? aseguradora : "";
              const nextModality = supportsVideoConsultCategory(id) ? modality : ANY_MODALITY;
              setCategory(id);
              if (!nextInsurer) setAseguradora("");
              if (nextModality === ANY_MODALITY) setModality(ANY_MODALITY);
              applyFilters({ categoria: id, aseguradora: nextInsurer, modalidad: nextModality });
            }}
            placeholder={t("filters.category")}
          />
        </div>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("ccr:open-filters"))} className={toggleChip(locationFilterActive)}>
          {locationDisplay || t("filters.costaRica")}
        </button>
        <div className="shrink-0 w-[150px]">
          <Select value={sortBy} onValueChange={(v) => {
            setSortBy(v);
            applyFilters({ sortBy: v });
          }}>
            <SelectTrigger className={pill}><SelectValue /></SelectTrigger>
            <SelectContent className={FILTER_CONTENT}>
              <SelectItem value="rating">{t("sort.rating")}</SelectItem>
              <SelectItem value="priceAsc">{t("sort.priceAsc")}</SelectItem>
              <SelectItem value="availability">{t("sort.availability")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {showVideoFilter && (
          <div className="shrink-0 w-[155px]">
            <Select value={modality} onValueChange={(v) => { setModality(v); applyFilters({ modalidad: v }); }}>
              <SelectTrigger className={pill}><SelectValue /></SelectTrigger>
              <SelectContent className={FILTER_CONTENT}>
                <SelectItem value={ANY_MODALITY}>{t("filters.attentionAny")}</SelectItem>
                <SelectItem value="in_person">{t("filters.attentionInPerson")}</SelectItem>
                <SelectItem value="video">{t("filters.attentionVideo")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="shrink-0 w-[155px]">
          <Select value={language || undefined} onValueChange={(v) => { const next = v === ANY_LANGUAGE ? "" : v; setLanguage(next); applyFilters({ idioma: next }); }}>
            <SelectTrigger className={pill}>
              <SelectValue placeholder={t("filters.anyLanguage")}>
                {language ? languageLabel(language, locale) : <span className="text-[#9ca3af]">{t("filters.anyLanguage")}</span>}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className={FILTER_CONTENT}>
              {language && <SelectItem value={ANY_LANGUAGE} className="text-[#6b7280]">{t("filters.allLanguages")}</SelectItem>}
              {LANGUAGES.map((item) => <SelectItem key={item.id} value={item.id}>{languageLabel(item.id, locale)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {showInsurerFilter && (
        <div className="shrink-0 w-[170px]">
          <Select value={aseguradora || undefined} onValueChange={(v) => { const next = v === ANY_INSURER ? "" : v; setAseguradora(next); applyFilters({ aseguradora: next }); }}>
            <SelectTrigger className={pill}>
              <SelectValue placeholder={t("filters.anyInsurer")}>
                {aseguradora ? insurerOptions.find((i) => i.id === aseguradora)?.label : <span className="text-[#9ca3af]">{t("filters.anyInsurer")}</span>}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className={FILTER_CONTENT}>
              {aseguradora && <SelectItem value={ANY_INSURER} className="text-[#6b7280]">{t("filters.anyInsurer")}</SelectItem>}
              {insurerOptions.map((i) => <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        )}
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
  // chrome (title bar / padding) â€” so drop the card border/rounding/padding here.
  const inDrawer = hideHeader;
  return (
    <div className={inDrawer ? "" : "rounded-2xl border border-[#e5e7eb] bg-white p-4"}>
      {/* Header â€” "Filtros" + a live active-count (inline clear when any are on) + an
          optional close X. `closable` is set ONLY for the mobile drawer instance, so the
          X lives INSIDE this white container's header; the desktop sidebar has no X. */}
      {!hideHeader && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[#111827]">{t("filters.title")}</h2>
          <div className="flex items-center gap-1.5">
            {activeCount > 0 && (
              // CLEAR = a LABELLED text link "Limpiar filtros (N)" â€” NOT a bare X (which read
              // like a close). A modern, unambiguous "clear all filters" affordance, visually
              // distinct from the panel-close X beside it (sprint 333).
              <button onClick={clearAll} className="text-[12px] font-semibold text-[#009FD9] hover:underline transition-colors whitespace-nowrap">
                {t("filters.clearAll")} ({activeCount})
              </button>
            )}
            {closable && (
              // CLOSE the whole filters panel â€” a distinct, LARGER FILLED circle X button, so
              // it never reads like the labelled "Limpiar filtros" clear action beside it.
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("ccr:close-filters"))}
                aria-label={t("close")}
                className="-mr-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827] active:scale-95 transition-all"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Vertical stack â€” EVERY filter is the SAME field shape: a `fieldLabel` + an
          `h-10 w-full rounded-xl border px-4` box, so all five line up identically (the
          user wants them all the exact size of Aseguradora). The unified service/category
          control is the FIRST field â€” a search INPUT, but boxed + padded to match the
          Select triggers EXACTLY (it used to be a label-less, icon-indented `pl-9` input,
          which read as a different size next to the px-4 dropdowns). */}
      <div className="flex flex-col gap-3">
        {/* Service/category â€” free text OR a picked category. Same box as the Selects:
            label + h-10 w-full px-4 (NO left search icon, so its text starts at the same
            x as Provincia/CantÃ³n/Ordenar/Aseguradora). */}
        {!hideSearch && (
          <div>
            <label className={fieldLabel}>{t("filters.service")}</label>
            <div ref={searchFieldRef} className="relative">
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
                    // Enter resolves the partial term to the highlighted OR the FIRST (best)
                    // match and searches THAT (e.g. "electrici" â†’ "electricista").
                    if (e.key === "Enter") {
                      e.preventDefault();
                      pickCategory(searchSug[searchActive >= 0 ? searchActive : 0].id);
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
                // EXACT same box as the Select triggers: h-10 w-full rounded-xl border, px-4
                // left, and pr-9 ALWAYS so the right glyph sits exactly where the dropdowns'
                // chevron does â€” so this field is indistinguishable in size + layout.
                className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-white pl-4 pr-9 text-base sm:text-sm text-[#111827] placeholder-[#9ca3af] transition hover:border-[#009FD9]/50 focus:border-[#009FD9] focus:outline-none focus:ring-2 focus:ring-[#009FD9]/20"
              />
              {/* Right-side glyph: a Search icon at rest (matches the Select chevron spot/
                  size/color), and while typing a SMALL, SUBTLE clear-X INSIDE the field â€” a
                  tiny icon in a hover-only circle, deliberately quieter + smaller than the
                  filled close-panel button so "clear my text" â‰  "close the panel" (sprint 327). */}
              {query ? (
                <button onClick={() => { clearQuery(); setSearchOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-full text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#374151] transition-colors" aria-label={t("filters.clearSearch")}>
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <Search className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280]" />
              )}
              <AnchoredDropdown anchorRef={searchFieldRef} open={searchOpen && searchSug.length > 0} maxHeight={288}>
                <ul className="py-1" role="listbox">
                  {searchSug.map((s, i) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={i === searchActive}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickCategory(s.id)}
                        className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors ${i === searchActive ? "bg-[#EBF5FB]" : "hover:bg-[#f9fafb]"}`}
                      >
                        <Search className="h-4 w-4 shrink-0 text-[#009FD9]" />
                        <span className="truncate text-[#374151]">{getCategoryLabel(s.id, locale)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </AnchoredDropdown>
            </div>
          </div>
        )}

        {/* Provincia + CantÃ³n â€” FULL-WIDTH stacked, exactly like every other filter
            (CategorÃ­a / Ordenar / Aseguradora). The old 2-column row made each box too
            narrow for "Todas las provincias"/"Todos los cantones" (overflow) and put the
            disabled-CantÃ³n faded border right next to Provincia â€” visually inconsistent. */}
        <div>
          <label className={fieldLabel}>{t("filters.location")}</label>
          <div ref={locationFieldRef} className="relative">
            <input
              type="text"
              value={locationQuery}
              onChange={(e) => {
                const nextValue = e.target.value;
                setLocationQuery(nextValue);
                setLocationActiveIndex(-1);
                setLocationOpen(nextValue.trim().length >= 2);
                if (!nextValue.trim()) {
                  setProvince("");
                  setCanton("");
                  setAddressSuggestions([]);
                  applyFilters({ provincia: "", canton: "", lat: "", lng: "", ubicacion: "" });
                }
              }}
              onFocus={() => { if (locationQuery.trim().length >= 2) setLocationOpen(true); }}
              onBlur={() => { locationBlurRef.current = setTimeout(() => setLocationOpen(false), 150); }}
              onKeyDown={handleLocationKeyDown}
              placeholder={t("filters.locationPlaceholder")}
              role="combobox"
              aria-expanded={locationOpen}
              aria-autocomplete="list"
              className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-white pl-4 pr-9 text-base sm:text-sm text-[#111827] placeholder-[#9ca3af] transition hover:border-[#009FD9]/50 focus:border-[#009FD9] focus:outline-none focus:ring-2 focus:ring-[#009FD9]/20"
            />
            {locationQuery ? (
              <button
                type="button"
                onClick={clearLocation}
                className="absolute right-3 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#374151]"
                aria-label={t("filters.clearLocation")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => requestMyLocation()}
                disabled={geoLoading}
                className={`group absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition-colors ${
                  geoActive ? "bg-[#EBF5FB] text-[#009FD9]" : "text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#009FD9]"
                }`}
                aria-label={geoActive ? t("filters.nearMeActive") : t("filters.nearMe")}
              >
                {geoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                <span className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-50 hidden whitespace-nowrap rounded-lg bg-[#0f2747] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lg group-hover:block group-focus-visible:block">
                  {t("filters.nearMeActive")}
                </span>
              </button>
            )}
            <AnchoredDropdown anchorRef={locationFieldRef} open={locationOpen && locationSug.length > 0} maxHeight={288}>
              <ul className="py-1" role="listbox">
                {locationSug.map((suggestion, i) => (
                  <li key={suggestion.type === "address" ? `address-${suggestion.placeId}` : `${suggestion.type}-${suggestion.type === "province" ? suggestion.id : `${suggestion.provinceId}-${suggestion.id}`}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === locationActiveIndex}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickLocationOption(suggestion)}
                      className={`flex w-full flex-col px-3.5 py-2.5 text-left text-sm transition-colors ${i === locationActiveIndex ? "bg-[#EBF5FB]" : "hover:bg-[#f9fafb]"}`}
                    >
                      <span className="font-semibold text-[#111827]">{suggestion.label}</span>
                      {suggestion.type !== "province" && suggestion.sublabel && <span className="text-xs text-[#6b7280]">{suggestion.sublabel}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </AnchoredDropdown>
          </div>
          {geoError && <span className="mt-1 block px-1 text-[11px] text-[#b45309]">{geoError}</span>}
        </div>

        <div>
          <label className={fieldLabel}>{t("filters.sortBy")}</label>
          <Select value={sortBy} onValueChange={(v) => {
            setSortBy(v);
            applyFilters({ sortBy: v });
          }}>
            <SelectTrigger className={FILTER_TRIGGER}><SelectValue>{sortLabel}</SelectValue></SelectTrigger>
            <SelectContent className={FILTER_CONTENT}>
              <SelectItem value="rating">{t("sort.rating")}</SelectItem>
              <SelectItem value="priceAsc">{t("sort.priceAsc")}</SelectItem>
              <SelectItem value="availability">{t("sort.availability")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {showVideoFilter && (
          <div>
            <label className={fieldLabel}>{t("filters.attention")}</label>
            <Select value={modality} onValueChange={(v) => { setModality(v); applyFilters({ modalidad: v }); }}>
            <SelectTrigger className={FILTER_TRIGGER}><SelectValue>{sortLabel}</SelectValue></SelectTrigger>
              <SelectContent className={FILTER_CONTENT}>
                <SelectItem value={ANY_MODALITY}>{t("filters.attentionAny")}</SelectItem>
                <SelectItem value="in_person">{t("filters.attentionInPerson")}</SelectItem>
                <SelectItem value="video">{t("filters.attentionVideo")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <label className={fieldLabel}>{t("filters.language")}</label>
          <Select
            value={language || undefined}
            onValueChange={(v) => { const next = v === ANY_LANGUAGE ? "" : v; setLanguage(next); applyFilters({ idioma: next }); }}
          >
            <SelectTrigger className={FILTER_TRIGGER}>
              <SelectValue placeholder={t("filters.anyLanguage")}>
                {language ? languageLabel(language, locale) : <span className="text-[#9ca3af]">{t("filters.anyLanguage")}</span>}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className={FILTER_CONTENT}>
              {language && <SelectItem value={ANY_LANGUAGE} className="text-[#6b7280]">{t("filters.allLanguages")}</SelectItem>}
              {LANGUAGES.map((item) => <SelectItem key={item.id} value={item.id}>{languageLabel(item.id, locale)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {showInsurerFilter && (
        <div>
          <label className={fieldLabel}>{t("filters.insurer")}</label>
          {/* Non-filtering default: nothing selected shows "Cualquier aseguradora"
              (greyed, like a placeholder, so it reads as NOT an active filter â€” most
              pros don't work with insurers). Pick one to filter. Clearing is the
              in-dropdown "Cualquier aseguradora" item (shown only when one is picked) so
              the field stays the SAME full-width size as every other filter â€” an external
              X button used to shrink this control ~40px narrower than the rest. */}
          <Select
            value={aseguradora || undefined}
            onValueChange={(v) => { const next = v === ANY_INSURER ? "" : v; setAseguradora(next); applyFilters({ aseguradora: next }); }}
          >
            <SelectTrigger className={FILTER_TRIGGER}>
              <SelectValue placeholder={t("filters.anyInsurer")}>
                {aseguradora
                  ? insurerOptions.find((i) => i.id === aseguradora)?.label
                  : <span className="text-[#9ca3af]">{t("filters.anyInsurer")}</span>}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className={FILTER_CONTENT}>
              {aseguradora && <SelectItem value={ANY_INSURER} className="text-[#6b7280]">{t("filters.anyInsurer")}</SelectItem>}
              {insurerOptions.map((i) => <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        )}
      </div>
    </div>
  );
}

// â”€â”€ MOBILE "Filtros" icon-button (in the single-line /buscar header) â”€â”€
// Compact icon-only trigger; dispatches `ccr:open-filters`, which `SearchResultsLayout`
// listens for to open the full-filter drawer. A brand-blue dot marks active filters.
export function MobileFiltersButton() {
  const t = useTranslations("search");
  const params = useSearchParams();
  const hasActiveInsurer = !!params.get("aseguradora") && isHealthCategory(params.get("categoria"));
  const hasActive =
    !!params.get("categoria") || !!params.get("provincia") || !!params.get("canton") ||
    hasActiveInsurer || !!params.get("idioma") || !!params.get("lat") ||
    (!!params.get("sortBy") && params.get("sortBy") !== "rating") || (!!params.get("modalidad") && params.get("modalidad") !== ANY_MODALITY);
  return (
    <button
      type="button"
      aria-label={t("filters.title")}
      onClick={() => window.dispatchEvent(new CustomEvent("ccr:open-filters"))}
      // Obvious filter affordance (sprint 524): a brand-tint pill with the sliders icon + the
      // "Filtros" label (not a bare icon), so it clearly reads as a tappable filter control.
      className="relative shrink-0 inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-[#bfdbfe] bg-[#EBF5FB] px-3.5 text-[13px] font-bold text-[#0089bb] shadow-sm active:scale-95 transition-transform"
    >
      <SlidersHorizontal className="h-[17px] w-[17px]" />
      <span>{t("filters.title")}</span>
      {hasActive && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#008ce0]" />}
    </button>
  );
}

// â”€â”€ MOBILE service-search bar (the "Busca un servicioâ€¦" field, pinned at the top) â”€â”€
// Self-contained: manages the `q` param (PRESERVING every other param), AND autocompletes
// against OUR professions/categories taxonomy (`searchCategories`) â€” typing shows matching
// services; picking one filters by `categoria` (clears `q`). Same debounced free-text search
// on Enter / blur. The taxonomy is the same one the "CategorÃ­a" filter + hero use.
export function MobileServiceSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useTranslations("search");
  const tHeader = useTranslations("header");
  const locale = useLocale();
  const customCategories = useCustomCategories();
  void customCategories;
  const [q, setQ] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => (q.trim().length >= 2 ? searchCategories(q).slice(0, 6) : []), [q, customCategories]);
  const searchExamples = useMemo(() => {
    const raw = tHeader.raw("searchExamples");
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  }, [tHeader]);
  const searchPlaceholder = useSearchExamplePlaceholder(searchExamples, !q.trim());

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
    if (!isHealthCategory(id)) next.delete("aseguradora");
    if (!supportsVideoConsultCategory(id)) next.delete("modalidad");
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
      // Enter resolves the partial term to the highlighted OR the FIRST (best) matching service
      // and searches THAT â€” e.g. "electrici" â†’ "electricista" (not a literal `q=electrici`).
      if (e.key === "Enter") { e.preventDefault(); if (debounceRef.current) clearTimeout(debounceRef.current); pickCategory(suggestions[active >= 0 ? active : 0].id); return; }
      if (e.key === "Escape") { setOpen(false); return; }
    }
    // No taxonomy match â†’ fall back to a literal text search (graceful).
    if (e.key === "Enter") { if (debounceRef.current) clearTimeout(debounceRef.current); setOpen(false); pushQuery(q); }
  }
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); if (blurRef.current) clearTimeout(blurRef.current); }, []);

  return (
    <div ref={fieldRef} className="relative flex min-w-0 w-full items-center">
      <input
        type="text"
        value={q}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        onBlur={() => { blurRef.current = setTimeout(() => setOpen(false), 150); }}
        placeholder={searchPlaceholder || t("filters.searchPlaceholder")}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className="h-10 min-w-0 w-full rounded-full border border-[#e5e7eb] bg-white pl-4 pr-9 text-base sm:text-sm text-[#111827] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition"
      />
      {q && (
        <button onClick={() => { setQ(""); setOpen(false); if (debounceRef.current) clearTimeout(debounceRef.current); pushQuery(""); }} className="absolute right-3 text-[#9ca3af] hover:text-[#374151] transition-colors" aria-label={t("filters.clearSearch")}>
          <X className="h-4 w-4" />
        </button>
      )}
      <AnchoredDropdown anchorRef={fieldRef} open={open && suggestions.length > 0} maxHeight={288}>
        <ul className="py-1" role="listbox">
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
      </AnchoredDropdown>
    </div>
  );
}
