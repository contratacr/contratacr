"use client";

import { useRouter, usePathname } from "@/i18n/navigation";
import { ScrollRail } from "@/components/ui/scroll-rail";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Search, X, Loader2, MapPin, SlidersHorizontal, ChevronDown, Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { matchProvinceCanton, PROVINCES } from "@/lib/data/cr-geography";
import { AnchoredDropdown } from "@/components/ui/anchored-dropdown";
import { searchCategories, getCategoryLabel, isHealthCategory, supportsVideoConsultCategory } from "@/lib/data/categories";
import { resolveLocation, searchLocations, type LocationSuggestion } from "@/lib/data/location-search";
import { INSURERS } from "@/lib/data/insurers";
import { LANGUAGES, languageLabel } from "@/lib/data/languages";
import { createClient } from "@/lib/supabase/client";
import { loadGoogleMaps } from "@/lib/maps/loader";
import { useCustomCategories } from "@/lib/data/use-custom-categories";
import { cn } from "@/lib/utils";

// Filter Select triggers stay on the ContrataCR blue system for focus/hover so
// the fields read the same whether a service filter is active or not.
const FILTER_TRIGGER = "text-sm";
// Open menu = EXACTLY the trigger's width, flush-aligned (left+right edges line up with
// the field) - like the "Servicio" autocomplete. By default Radix popper content sizes to
// its OPTIONS (with a min-w), so a short list (e.g. Aseguradora) opens narrower than its
// full-width trigger and misaligns. `--radix-select-trigger-width` is the trigger's width
// (exposed on popper content); `min-w-0` drops the shared `min-w-[8rem]` so the match is
// exact even for a narrow trigger. Filters only - the shared Select is untouched.
const FILTER_CONTENT = "min-w-0 w-[var(--radix-select-trigger-width)]";
// Sentinel for the in-dropdown "Cualquier aseguradora" reset item (Radix Select forbids
// an empty-string value, so we map this back to "" = no insurer filter).
const ANY_PRICE = "__any_price__";
const ANY_LANGUAGE = "__any_language__";
const ANY_MODALITY = "any";
const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const SORT_OPTIONS = ["rating", "cercania", "experience"] as const;
const BASE_SORT_OPTIONS = ["rating", "experience"] as const;
const PRICE_AVAILABILITY_OPTIONS = ["quote"] as const;
const PRICE_UNIT_OPTIONS = ["por_hora", "por_consulta", "por_proyecto"] as const;
const PRICE_CHOICES = [ANY_PRICE, "quote", ...PRICE_UNIT_OPTIONS] as const;
const normalizeSort = (value: string) =>
  SORT_OPTIONS.includes(value as (typeof SORT_OPTIONS)[number]) ? value : "rating";
const normalizePriceFilter = (value: string) =>
  PRICE_AVAILABILITY_OPTIONS.includes(value as (typeof PRICE_AVAILABILITY_OPTIONS)[number]) ? value : "";
const normalizePriceUnit = (value: string) =>
  PRICE_UNIT_OPTIONS.includes(value as (typeof PRICE_UNIT_OPTIONS)[number]) ? value : "";
const priceChoiceFromFilters = (availability: string, units: string[]) => {
  const unit = units.find((value) => PRICE_UNIT_OPTIONS.includes(value as (typeof PRICE_UNIT_OPTIONS)[number]));
  return unit || (availability === "quote" ? "quote" : ANY_PRICE);
};
const filtersFromPriceChoice = (choice: string) => {
  if (PRICE_UNIT_OPTIONS.includes(choice as (typeof PRICE_UNIT_OPTIONS)[number])) {
    return { availability: "", units: [choice] };
  }
  if (choice === "quote") return { availability: choice, units: [] };
  return { availability: "", units: [] };
};
const parseMultiParam = (value?: string | null) =>
  Array.from(new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean)));
const parseSingleParam = (value?: string | null) => parseMultiParam(value)[0] ?? "";
const serializeMultiParam = (values: string[]) => values.join(",");
const toggleMultiValue = (values: string[], value: string) =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
type SearchModality = "in_person" | "video";
const isSearchModality = (value: string): value is SearchModality =>
  value === "in_person" || value === "video";

type AddressSuggestion = {
  type: "address";
  placeId: string;
  label: string;
  sublabel?: string;
};

type LocationOption = LocationSuggestion | AddressSuggestion;

type FilterSheetOption = {
  value: string;
  label: string;
};

function ViewportPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

function FilterSheet({
  open,
  title,
  value,
  options,
  onClose,
  onSelect,
}: {
  open: boolean;
  title: string;
  value: string;
  options: FilterSheetOption[];
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <ViewportPortal>
    <div className="fixed inset-0 z-[220] flex items-end justify-center lg:items-center lg:p-6" role="presentation">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-[#071426]/55" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-xl overflow-hidden rounded-t-[22px] bg-white shadow-2xl lg:rounded-[18px]"
      >
        <div className="flex items-center justify-between border-b border-[#edf1f5] px-5 py-4">
          <h2 className="text-[20px] font-extrabold text-[#162543]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-9 w-9 items-center justify-center text-[#162543]"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-1">
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onSelect(option.value)}
                className="flex min-h-[58px] w-full items-center justify-between gap-4 border-b border-[#f0f3f6] py-3 text-left last:border-b-0"
              >
                <span className={cn("text-[16px] font-semibold", selected ? "text-[#008fbe]" : "text-[#162543]")}>{option.label}</span>
                <span className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2",
                  selected ? "border-[#009FD9] bg-[#009FD9]" : "border-[#cbd5df] bg-white",
                )}>
                  {selected && <Check className="h-4 w-4 stroke-[3] text-white" />}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
    </ViewportPortal>
  );
}

function MultiFilterSheet({
  open,
  title,
  values,
  options,
  onClose,
  onApply,
}: {
  open: boolean;
  title: string;
  values: string[];
  options: FilterSheetOption[];
  onClose: () => void;
  onApply: (values: string[]) => void;
}) {
  if (!open) return null;

  return (
    <MultiFilterSheetContent
      title={title}
      values={values}
      options={options}
      onClose={onClose}
      onApply={onApply}
    />
  );
}

function MultiFilterSheetContent({
  title,
  values,
  options,
  onClose,
  onApply,
}: Omit<React.ComponentProps<typeof MultiFilterSheet>, "open">) {
  const t = useTranslations("search");
  const [draftValues, setDraftValues] = useState(values);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <ViewportPortal>
    <div className="fixed inset-0 z-[220] flex items-end justify-center lg:items-center lg:p-6" role="presentation">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-[#071426]/55" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-label={title} className="relative z-10 w-full max-w-xl overflow-hidden rounded-t-[22px] bg-white shadow-2xl lg:rounded-[18px]">
        <div className="flex items-center justify-between border-b border-[#edf1f5] px-5 py-4">
          <div>
            <h2 className="text-[20px] font-extrabold text-[#162543]">{title}</h2>
            {draftValues.length > 0 && <p className="mt-0.5 text-xs font-semibold text-[#64748b]">{draftValues.length} seleccionadas</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="inline-flex h-9 w-9 items-center justify-center text-[#162543]">
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-1">
          {draftValues.length > 0 && (
            <button type="button" onClick={() => setDraftValues([])} className="flex min-h-[50px] w-full items-center text-left text-sm font-bold text-[#009FD9]">
              {t("filters.clearAll")}
            </button>
          )}
          {options.map((option) => {
            const selected = draftValues.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setDraftValues((current) => toggleMultiValue(current, option.value))}
                className="flex min-h-[56px] w-full items-center justify-between gap-4 border-b border-[#f0f3f6] py-3 text-left last:border-b-0"
              >
                <span className={cn("text-[15px] font-semibold", selected ? "text-[#008fbe]" : "text-[#162543]")}>{option.label}</span>
                <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-[6px] border-2", selected ? "border-[#009FD9] bg-[#009FD9]" : "border-[#cbd5df] bg-white")}>
                  {selected && <Check className="h-4 w-4 stroke-[3] text-white" />}
                </span>
              </button>
            );
          })}
          <button type="button" onClick={() => onApply(draftValues)} className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-[8px] bg-[#009FD9] px-5 text-[15px] font-bold text-white">
            {t("filters.showResults")}
          </button>
        </div>
      </section>
    </div>
    </ViewportPortal>
  );
}

function DesktopMultiSelect({
  label,
  emptyLabel,
  values,
  options,
  onChange,
}: {
  label: string;
  emptyLabel: string;
  values: string[];
  options: FilterSheetOption[];
  onChange: (values: string[]) => void;
}) {
  const t = useTranslations("search");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedLabels = options.filter((option) => values.includes(option.value)).map((option) => option.label);
  const summary = selectedLabels.length === 0 ? emptyLabel : selectedLabels.length === 1 ? selectedLabels[0] : `${label} (${selectedLabels.length})`;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-xl border bg-white px-4 py-2.5 text-left text-sm transition-all duration-150 outline-none",
          open
            ? "border-[#009FD9]"
            : "border-[#e5e7eb] hover:border-[#8ccfe8] hover:bg-[#fbfdff]",
        )}
      >
        <span className={cn("min-w-0 truncate", values.length ? "font-semibold text-[#162543]" : "text-[#9ca3af]")}>{summary}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {values.length > 1 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#EBF5FB] px-1 text-[11px] font-extrabold text-[#008fbe]">{values.length}</span>}
          <ChevronDown className={cn("h-4 w-4 text-[#64748b] transition-transform", open && "rotate-180")} />
        </span>
      </button>
      <AnchoredDropdown open={open} anchorRef={triggerRef} className="z-[210] max-h-72 w-[var(--anchor-width)] min-w-[220px] overflow-y-auto rounded-[10px] border border-[#dbe4ec] bg-white p-1.5 shadow-xl">
        <div ref={menuRef}>
          {values.length > 0 && <button type="button" onClick={() => onChange([])} className="flex min-h-10 w-full items-center rounded-[7px] px-3 text-left text-sm font-bold text-[#009FD9] hover:bg-[#f4f9fc]">{t("filters.clearAll")}</button>}
          {options.map((option) => {
            const selected = values.includes(option.value);
            return <button key={option.value} type="button" onClick={() => onChange(toggleMultiValue(values, option.value))} className={cn("flex min-h-10 w-full items-center justify-between gap-3 rounded-[7px] px-3 text-left text-sm font-semibold hover:bg-[#f4f9fc]", selected ? "text-[#008fbe]" : "text-[#162543]")}>
              <span>{option.label}</span>
              <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border-2", selected ? "border-[#009FD9] bg-[#009FD9]" : "border-[#cbd5df]")}>{selected && <Check className="h-3.5 w-3.5 stroke-[3] text-white" />}</span>
            </button>;
          })}
        </div>
      </AnchoredDropdown>
    </div>
  );
}

function PriceFilterSheet({
  open,
  availability,
  units,
  onClose,
  onApply,
}: {
  open: boolean;
  availability: string;
  units: string[];
  onClose: () => void;
  onApply: (availability: string, units: string[]) => void;
}) {
  if (!open) return null;

  return (
    <PriceFilterSheetContent
      availability={availability}
      units={units}
      onClose={onClose}
      onApply={onApply}
    />
  );
}

function PriceFilterSheetContent({
  availability,
  units,
  onClose,
  onApply,
}: Omit<React.ComponentProps<typeof PriceFilterSheet>, "open">) {
  const t = useTranslations("search");
  const currentChoice = priceChoiceFromFilters(availability, units);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const option = (value: string, label: string, selected: boolean, onSelect: () => void) => (
    <button
      key={value}
      type="button"
      onClick={onSelect}
      className="flex min-h-[52px] w-full items-center justify-between gap-4 border-b border-[#f0f3f6] py-2.5 text-left last:border-b-0"
    >
      <span className={cn("text-[15px] font-semibold", selected ? "text-[#008fbe]" : "text-[#162543]")}>{label}</span>
      <span className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2",
        selected ? "border-[#009FD9] bg-[#009FD9]" : "border-[#cbd5df] bg-white",
      )}>
        {selected && <Check className="h-4 w-4 stroke-[3] text-white" />}
      </span>
    </button>
  );

  return (
    <ViewportPortal>
    <div className="fixed inset-0 z-[220] flex items-end justify-center lg:items-center lg:p-6" role="presentation">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-[#071426]/55" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-label={t("filters.price")} className="relative z-10 w-full max-w-xl overflow-hidden rounded-t-[22px] bg-white shadow-2xl lg:rounded-[18px]">
        <div className="flex items-center justify-between border-b border-[#edf1f5] px-5 py-4">
          <h2 className="text-[20px] font-extrabold text-[#162543]">{t("filters.price")}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="inline-flex h-9 w-9 items-center justify-center text-[#162543]">
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="py-3">
            {PRICE_CHOICES.map((value) => option(
              value,
              value === ANY_PRICE ? t("filters.anyPrice") : t(`priceFilter.${value}`),
              currentChoice === value,
              () => {
                const next = filtersFromPriceChoice(value);
                onApply(next.availability, next.units);
              },
            ))}
          </div>
        </div>
      </section>
    </div>
    </ViewportPortal>
  );
}

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
  precio?: string;
  unidadPrecio?: string;
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
  const paramsKey = params.toString();

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
  const [sortBy, setSortBy] = useState(normalizeSort(initialSort));
  const sortLabel = t(`sort.${SORT_OPTIONS.includes(sortBy as (typeof SORT_OPTIONS)[number]) ? sortBy : "rating"}`);
  const [modalities, setModalities] = useState<SearchModality[]>(() =>
    parseMultiParam(initialParam("modalidad")).filter(isSearchModality)
  );
  const [insurers, setInsurers] = useState(() =>
    isHealthCategory(initialCategory) ? parseMultiParam(initialParam("aseguradora")) : []
  );
  const [language, setLanguage] = useState(() => parseSingleParam(initialParam("idioma")));
  const initialPrice = initialParam("precio");
  const initialPriceUnits = parseMultiParam(initialParam("unidadPrecio") || initialPrice).map(normalizePriceUnit).filter(Boolean);
  const [priceFilter, setPriceFilter] = useState(normalizePriceFilter(initialPrice));
  const [priceUnits, setPriceUnits] = useState(initialPriceUnits);
  const [openChip, setOpenChip] = useState<"sort" | "price" | "language" | "modality" | "insurer" | null>(null);
  // Geolocation ("cerca de mí") - opt-in, requested only when the user taps the
  // control, never auto-popped. Denied/unavailable -> text search still works.
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const geoActive = !!params.get("lat") && !!params.get("lng");
  const selectableSortOptions = geoActive ? BASE_SORT_OPTIONS : SORT_OPTIONS;

  // Official list = static INSURERS + admin-approved additions from the DB.
  // The filter never offers a "Ninguna / Todas / sin seguros" entry - those are a
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
    const nextCategory = params.get("categoria") ?? initialValues?.categoria ?? "";
    const nextQuery = params.get("q") ?? initialValues?.q ?? "";
    const nextProvince = params.get("provincia") ?? initialValues?.provincia ?? "";
    const nextCanton = params.get("canton") ?? initialValues?.canton ?? "";
    const nextSort = params.get("sortBy") ?? initialValues?.sortBy ?? "";
    const nextModalities = parseMultiParam(params.get("modalidad") ?? initialValues?.modalidad ?? "").filter((value) => value === "video" || value === "in_person");
    const nextInsurers = parseMultiParam(params.get("aseguradora") ?? initialValues?.aseguradora ?? "");
    const nextLanguage = parseSingleParam(params.get("idioma") ?? initialValues?.idioma ?? "");
    const nextPrice = params.get("precio") ?? initialValues?.precio ?? "";
    const nextPriceUnitRaw = params.get("unidadPrecio") ?? initialValues?.unidadPrecio ?? "";
    const nextPriceUnits = parseMultiParam(nextPriceUnitRaw || nextPrice).map(normalizePriceUnit).filter(Boolean);
    const nextLat = params.get("lat") ?? initialValues?.lat ?? "";
    const nextLng = params.get("lng") ?? initialValues?.lng ?? "";
    const nextLocation = params.get("ubicacion") ?? initialValues?.ubicacion ?? "";

    // URL navigation is the external source of truth for the filter controls.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCategory(nextCategory);
    setQuery(nextQuery || (nextCategory && nextCategory !== "todas" ? getCategoryLabel(nextCategory, locale) : ""));
    setProvince(nextProvince);
    setCanton(nextCanton);
    const normalizedNextSort = normalizeSort(nextSort);
    setSortBy(nextLat && nextLng && normalizedNextSort === "cercania" ? "rating" : normalizedNextSort);
    setModalities(supportsVideoConsultCategory(nextCategory) ? nextModalities : []);
    setInsurers(isHealthCategory(nextCategory) ? nextInsurers : []);
    setLanguage(nextLanguage);
    setPriceFilter(normalizePriceFilter(nextPrice));
    setPriceUnits(nextPriceUnits);
    setLocationQuery(
      nextLocation
        ? nextLocation
        : nextLat && nextLng
        ? t("filters.nearMeActive")
        : locationFilterLabel(nextProvince, nextCanton)
    );
    setSearchOpen(false);
    setSearchActive(-1);
    setLocationOpen(false);
    setLocationActiveIndex(-1);
    setAddressSuggestions([]);
  }, [
    paramsKey,
    initialValues?.aseguradora,
    initialValues?.canton,
    initialValues?.categoria,
    initialValues?.idioma,
    initialValues?.precio,
    initialValues?.unidadPrecio,
    initialValues?.lat,
    initialValues?.lng,
    initialValues?.modalidad,
    initialValues?.provincia,
    initialValues?.q,
    initialValues?.sortBy,
    initialValues?.ubicacion,
    locale,
    t,
  ]);

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
      // so take `q` from the URL - never from this instance's stale local `query` - to
      // avoid clobbering what the search bar set. The sidebar keeps using its own input.
      const vals = {
        q: variant === "chips" ? (params.get("q") ?? "") : query,
        categoria: category,
        provincia: province,
        canton,
        sortBy,
        modalidad: serializeMultiParam(modalities),
        aseguradora: serializeMultiParam(insurers),
        idioma: language,
        precio: priceFilter,
        unidadPrecio: serializeMultiParam(priceUnits),
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
      if (supportsVideoConsultCategory(vals.categoria) && vals.modalidad) next.set("modalidad", vals.modalidad);
      if (isHealthCategory(vals.categoria) && vals.aseguradora) next.set("aseguradora", vals.aseguradora);
      if (vals.idioma) next.set("idioma", vals.idioma);
      if (vals.precio && vals.precio !== "todos") next.set("precio", vals.precio);
      if (vals.unidadPrecio) next.set("unidadPrecio", vals.unidadPrecio);
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
    [query, category, province, canton, sortBy, modalities, insurers, language, priceFilter, priceUnits, params, router, pathname, variant]
  );

  // Request geolocation on demand. Coordinates define the search area while
  // results keep the default quality ordering.
  function requestMyLocation() {
    if (geoActive) {
      // Toggle OFF - drop the proximity sort + coords, keep other filters.
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
        setSortBy("rating");
        applyFilters({ sortBy: "rating", provincia: "", canton: "", ubicacion: "", lat: String(latitude.toFixed(5)), lng: String(longitude.toFixed(5)) });
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
    if (modalities.length) setModalities([]);
    if (insurers.length) setInsurers([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const hasCategorySuggestions = value.trim().length >= 2 && searchCategories(value).length > 0;
    if (hasCategorySuggestions) return;
    debounceRef.current = setTimeout(() => applyFilters({ q: value, categoria: "", aseguradora: "", modalidad: "" }), 400);
  }

  function handleQueryKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setCategory("");
      setModalities([]);
      setInsurers([]);
      applyFilters({ q: query, categoria: "", aseguradora: "", modalidad: "" });
      if (!locationQuery.trim()) window.setTimeout(() => locationInputRef.current?.focus(), 80);
    }
  }

  // Picking a category suggestion -> set `categoria`, clear the free-text `q`, and cancel
  // any pending free-text debounce (so it can't fire afterward and wipe the category).
  function pickCategory(id: string) {
    if (searchBlurRef.current) {
      clearTimeout(searchBlurRef.current);
      searchBlurRef.current = null;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const nextInsurers = isHealthCategory(id) ? insurers : [];
    const nextModalities = supportsVideoConsultCategory(id) ? modalities : [];
    setCategory(id);
    if (!nextInsurers.length) setInsurers([]);
    if (!nextModalities.length) setModalities([]);
    setQuery(getCategoryLabel(id, locale));
    setSearchOpen(false);
    applyFilters({ categoria: id, q: "", aseguradora: serializeMultiParam(nextInsurers), modalidad: serializeMultiParam(nextModalities) });
    // Service answered → hand the focus to the location field (if still empty).
    if (!locationQuery.trim()) window.setTimeout(() => locationInputRef.current?.focus(), 80);
  }

  function clearQuery() {
    setQuery(""); setCategory(""); setModalities([]); setInsurers([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    applyFilters({ q: "", categoria: "", aseguradora: "", modalidad: "" });
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (locationBlurRef.current) clearTimeout(locationBlurRef.current);
      if (searchBlurRef.current) clearTimeout(searchBlurRef.current);
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

  const locationInputRef = useRef<HTMLInputElement>(null);
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
    setQuery(""); setCategory(""); setProvince(""); setCanton(""); setLocationQuery(""); setSortBy("rating"); setModalities([]); setInsurers([]); setLanguage(""); setPriceFilter(""); setPriceUnits([]);
    setAddressSuggestions([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    router.push(pathname);
  }

  // The unified service field (free text OR a picked category) counts as ONE filter - not
  // two - even though it's backed by `q` XOR `categoria`.
  const serviceActive = !!(query.trim() || (category && category !== "todas"));
  const locationDisplay = params.get("ubicacion") ?? (geoActive ? t("filters.nearMeActive") : locationFilterLabel(province, canton));
  const locationFilterActive = geoActive || !!locationDisplay;
  const activeCount =
    (serviceActive ? 1 : 0) +
    (locationFilterActive ? 1 : 0) +
    (showVideoFilter && modalities.length ? 1 : 0) +
    (areaActive ? 1 : 0) +
    (showInsurerFilter && insurers.length ? 1 : 0) +
    (priceFilter ? 1 : 0) +
    (priceUnits.length ? 1 : 0) +
    (language ? 1 : 0);

  // -- MOBILE chips variant --------------------------------------------------
  // A single horizontally-scrollable row of pill controls (NO vertical sidebar, NO
  // search input - that's the separate MobileServiceSearch). Reuses every handler above,
  // so the filtering/URL logic is identical; only the presentation differs.
  if (variant === "chips") {
    const sortOptions = selectableSortOptions.map((option) => ({ value: option, label: t(`sort.${option}`) }));
    const languageOptions = [
      { value: ANY_LANGUAGE, label: t("filters.allLanguages") },
      ...LANGUAGES.map((item) => ({ value: item.id, label: languageLabel(item.id, locale) })),
    ];
    const modalityOptions = [
      { value: "in_person", label: t("filters.attentionInPerson") },
      { value: "video", label: t("filters.attentionVideo") },
    ];
    const priceChoice = priceChoiceFromFilters(priceFilter, priceUnits);
    const priceText = priceChoice === ANY_PRICE ? t("filters.price") : t(`priceFilter.${priceChoice}`);
    const languageText = language
      ? languageOptions.find((option) => option.value === language)?.label ?? t("filters.language")
      : locale === "en" ? "Language" : "Idioma";
    const pill = "ccr-search-filter-chip inline-flex h-8 w-max shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-[#d8e2ea] bg-white px-2 text-[9px] font-bold text-[#162543] shadow-sm min-[350px]:px-2.5 min-[350px]:text-[10px] min-[390px]:text-[11px]";
    return (
      <ScrollRail className="flex w-full min-w-0 items-center gap-1 overflow-y-visible pb-0.5">
        <div className="flex w-max min-w-full items-center justify-start gap-1">
          <button type="button" onClick={() => setOpenChip("sort")} className={pill}>
            <span className="min-w-0 whitespace-nowrap">{sortLabel}</span><ChevronDown className="h-3 w-3 shrink-0 min-[390px]:h-3.5 min-[390px]:w-3.5" />
          </button>
          <button type="button" onClick={() => setOpenChip("price")} className={pill}>
            <span className="min-w-0 whitespace-nowrap">{priceText}</span><ChevronDown className="h-3 w-3 shrink-0 min-[390px]:h-3.5 min-[390px]:w-3.5" />
          </button>
          <button data-testid="mobile-language-filter" type="button" onClick={() => setOpenChip("language")} className={pill}>
            <span className="min-w-0 whitespace-nowrap">{languageText}</span><ChevronDown className="h-3 w-3 shrink-0 min-[390px]:h-3.5 min-[390px]:w-3.5" />
          </button>
          {showVideoFilter && <button type="button" onClick={() => setOpenChip("modality")} className={pill}>
            <span className="min-w-0 whitespace-nowrap">{modalities.length ? `${t("filters.attention")} (${modalities.length})` : t("filters.attention")}</span><ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </button>}
          {showInsurerFilter && <button type="button" onClick={() => setOpenChip("insurer")} className={pill}>
            <span className="min-w-0 whitespace-nowrap">{insurers.length ? `${t("filters.insurer")} (${insurers.length})` : t("filters.insurer")}</span><ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </button>}
        </div>
        <FilterSheet
          open={openChip === "sort"}
          title={locale === "en" ? "Sort" : "Ordenar"}
          value={sortBy}
          options={sortOptions}
          onClose={() => setOpenChip(null)}
          onSelect={(value) => {
            setSortBy(value);
            if (value === "cercania" && !geoActive) requestMyLocation();
            else applyFilters({ sortBy: value });
            setOpenChip(null);
          }}
        />
        <PriceFilterSheet
          open={openChip === "price"}
          availability={priceFilter}
          units={priceUnits}
          onClose={() => setOpenChip(null)}
          onApply={(nextAvailability, nextUnits) => {
            setPriceFilter(nextAvailability);
            setPriceUnits(nextUnits);
            applyFilters({ precio: nextAvailability, unidadPrecio: serializeMultiParam(nextUnits) });
            setOpenChip(null);
          }}
        />
        <FilterSheet
          open={openChip === "language"}
          title={t("filters.language")}
          value={language || ANY_LANGUAGE}
          options={languageOptions}
          onClose={() => setOpenChip(null)}
          onSelect={(value) => {
            const nextLanguage = value === ANY_LANGUAGE ? "" : value;
            setLanguage(nextLanguage);
            applyFilters({ idioma: nextLanguage });
            setOpenChip(null);
          }}
        />
        {showVideoFilter && <MultiFilterSheet open={openChip === "modality"} title={t("filters.attention")} values={modalities} options={modalityOptions} onClose={() => setOpenChip(null)} onApply={(next) => { const nextModalities = next.filter(isSearchModality); setModalities(nextModalities); applyFilters({ modalidad: serializeMultiParam(nextModalities) }); setOpenChip(null); }} />}
        {showInsurerFilter && <MultiFilterSheet open={openChip === "insurer"} title={t("filters.insurer")} values={insurers} options={insurerOptions.map((item) => ({ value: item.id, label: item.label }))} onClose={() => setOpenChip(null)} onApply={(next) => { setInsurers(next); applyFilters({ aseguradora: serializeMultiParam(next) }); setOpenChip(null); }} />}
      </ScrollRail>
    );
  }

  const fieldLabel = "mb-1 block text-[11px] font-semibold text-[#6b7280]";
  // `hideHeader` = rendered inside the mobile filter sheet, which supplies its own
  // chrome (title bar / padding) - so drop the card border/rounding/padding here.
  const inDrawer = hideHeader;
  return (
    <div className={inDrawer ? "" : "rounded-2xl border border-[#e5e7eb] bg-white p-4"}>
      {/* Header - "Filtros" + a live active-count (inline clear when any are on) + an
          optional close X. `closable` is set ONLY for the mobile drawer instance, so the
          X lives INSIDE this white container's header; the desktop sidebar has no X. */}
      {!hideHeader && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[#111827]">{t("filters.title")}</h2>
          <div className="flex items-center gap-1.5">
            {activeCount > 0 && (
              // CLEAR = a LABELLED text link "Limpiar filtros (N)" - NOT a bare X (which read
              // like a close). A modern, unambiguous "clear all filters" affordance, visually
              // distinct from the panel-close X beside it (sprint 333).
              <button onClick={clearAll} className="text-[12px] font-semibold text-[#009FD9] hover:underline transition-colors whitespace-nowrap">
                {t("filters.clearAll")} ({activeCount})
              </button>
            )}
            {closable && (
              // CLOSE the whole filters panel - a distinct, LARGER FILLED circle X button, so
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

      {/* Vertical stack - EVERY filter is the SAME field shape: a `fieldLabel` + an
          `h-10 w-full rounded-xl border px-4` box, so all five line up identically (the
          user wants them all the exact size of Aseguradora). The unified service/category
          control is the FIRST field - a search INPUT, but boxed + padded to match the
          Select triggers EXACTLY (it used to be a label-less, icon-indented `pl-9` input,
          which read as a different size next to the px-4 dropdowns). */}
      <div className="flex flex-col gap-3">
        {/* Service/category - free text OR a picked category. Same box as the Selects:
            label + h-10 w-full px-4 (NO left search icon, so its text starts at the same
            x as Provincia/Canton/Ordenar/Aseguradora). */}
        {!hideSearch && (
          <div>
            <label className={fieldLabel}>{t("filters.service")}</label>
            <div ref={searchFieldRef} className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => { handleQueryChange(e.target.value); setSearchActive(-1); setSearchOpen(true); }}
                onFocus={() => {
                  if (searchBlurRef.current) {
                    clearTimeout(searchBlurRef.current);
                    searchBlurRef.current = null;
                  }
                  if (searchSug.length > 0) setSearchOpen(true);
                }}
                onBlur={() => {
                  if (searchBlurRef.current) clearTimeout(searchBlurRef.current);
                  searchBlurRef.current = setTimeout(() => {
                    setSearchOpen(false);
                    searchBlurRef.current = null;
                  }, 150);
                }}
                onKeyDown={(e) => {
                  if (searchOpen && searchSug.length > 0) {
                    if (e.key === "ArrowDown") { e.preventDefault(); setSearchActive((i) => Math.min(i + 1, searchSug.length - 1)); return; }
                    if (e.key === "ArrowUp") { e.preventDefault(); setSearchActive((i) => Math.max(i - 1, 0)); return; }
                    // Enter resolves the partial term to the highlighted OR the FIRST (best)
                    // match and searches THAT (e.g. "electrici" -> "electricista").
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
                // chevron does - so this field is indistinguishable in size + layout.
                className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-white pl-4 pr-9 text-base sm:text-sm text-[#111827] placeholder-[#9ca3af] transition hover:border-[#009FD9]/50 focus:border-[#009FD9] focus:outline-none focus:ring-2 focus:ring-[#009FD9]/20"
              />
              {/* Right-side glyph: a Search icon at rest (matches the Select chevron spot/
                  size/color), and while typing a SMALL, SUBTLE clear-X INSIDE the field - a
                  tiny icon in a hover-only circle, deliberately quieter + smaller than the
                  filled close-panel button so "clear my text" != "close the panel" (sprint 327). */}
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
                        onPointerDown={(e) => {
                          // Select before the input blur can close the portalled list.
                          e.preventDefault();
                          pickCategory(s.id);
                        }}
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

        {/* Provincia + Canton - FULL-WIDTH stacked, exactly like every other filter
            (Categoria / Ordenar / Aseguradora). The old 2-column row made each box too
            narrow for "Todas las provincias"/"Todos los cantones" (overflow) and put the
            disabled-Canton faded border right next to Provincia - visually inconsistent. */}
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
              onFocus={() => setLocationOpen(locationQuery.trim().length >= 2)}
              onBlur={() => { locationBlurRef.current = setTimeout(() => setLocationOpen(false), 150); }}
              ref={locationInputRef}
              onKeyDown={handleLocationKeyDown}
              placeholder={t("filters.locationPlaceholder")}
              role="combobox"
              aria-label={t("filters.location")}
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
            ) : null}
            <AnchoredDropdown
              anchorRef={locationFieldRef}
              open={locationOpen && locationQuery.trim().length >= 2}
              maxHeight={288}
            >
              <ul className="py-1" role="listbox">
                {!geoActive && (
                  <li>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setLocationOpen(false);
                        requestMyLocation();
                      }}
                      disabled={geoLoading}
                      className="flex w-full items-center gap-2.5 whitespace-nowrap border-b border-[#eef2f6] px-3.5 py-3 text-left text-sm font-semibold text-[#009FD9] transition-colors hover:bg-[#EBF5FB] disabled:opacity-60"
                    >
                      {geoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                      <span>{t("filters.nearMe")}</span>
                    </button>
                  </li>
                )}
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
            if (v === "cercania" && !geoActive) requestMyLocation();
            else applyFilters({ sortBy: v });
          }}>
            <SelectTrigger className={FILTER_TRIGGER}><SelectValue>{sortLabel}</SelectValue></SelectTrigger>
            <SelectContent className={FILTER_CONTENT}>
              {selectableSortOptions.map((option) => (
                <SelectItem key={option} value={option}>{t(`sort.${option}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className={fieldLabel}>{t("filters.price")}</label>
          <Select
            value={priceChoiceFromFilters(priceFilter, priceUnits)}
            onValueChange={(choice) => {
              const next = filtersFromPriceChoice(choice);
              setPriceFilter(next.availability);
              setPriceUnits(next.units);
              applyFilters({ precio: next.availability, unidadPrecio: serializeMultiParam(next.units) });
            }}
          >
            <SelectTrigger className={FILTER_TRIGGER}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={FILTER_CONTENT}>
              {PRICE_CHOICES.map((choice) => (
                <SelectItem key={choice} value={choice}>
                  {choice === ANY_PRICE ? t("filters.anyPrice") : t(`priceFilter.${choice}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showVideoFilter && (
          <div>
            <label className={fieldLabel}>{t("filters.attention")}</label>
            <DesktopMultiSelect
              label={t("filters.attention")}
              emptyLabel={t("filters.attentionAny")}
              values={modalities}
              options={[
                { value: "in_person", label: t("filters.attentionInPerson") },
                { value: "video", label: t("filters.attentionVideo") },
              ]}
              onChange={(next) => {
                const nextModalities = next.filter(isSearchModality);
                setModalities(nextModalities);
                applyFilters({ modalidad: serializeMultiParam(nextModalities) });
              }}
            />
          </div>
        )}

        <div>
          <label className={fieldLabel}>{t("filters.language")}</label>
          <Select
            value={language || ANY_LANGUAGE}
            onValueChange={(value) => {
              const nextLanguage = value === ANY_LANGUAGE ? "" : value;
              setLanguage(nextLanguage);
              applyFilters({ idioma: nextLanguage });
            }}
          >
            <SelectTrigger className={FILTER_TRIGGER} aria-label={t("filters.language")}><SelectValue /></SelectTrigger>
            <SelectContent className={FILTER_CONTENT}>
              <SelectItem value={ANY_LANGUAGE}>{t("filters.anyLanguage")}</SelectItem>
              {LANGUAGES.map((item) => (
                <SelectItem key={item.id} value={item.id}>{languageLabel(item.id, locale)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showInsurerFilter && (
        <div>
          <label className={fieldLabel}>{t("filters.insurer")}</label>
          <DesktopMultiSelect
            label={t("filters.insurer")}
            emptyLabel={t("filters.anyInsurer")}
            values={insurers}
            options={insurerOptions.map((item) => ({ value: item.id, label: item.label }))}
            onChange={(next) => {
              setInsurers(next);
              applyFilters({ aseguradora: serializeMultiParam(next) });
            }}
          />
        </div>
        )}
      </div>
    </div>
  );
}

// -- MOBILE "Filtros" icon-button (in the single-line /buscar header) --
// Compact icon-only trigger; dispatches `ccr:open-filters`, which `SearchResultsLayout`
// listens for to open the full-filter drawer. A brand-blue dot marks active filters.
export function MobileFiltersButton() {
  const t = useTranslations("search");
  const params = useSearchParams();
  const hasActiveInsurer = !!params.get("aseguradora") && isHealthCategory(params.get("categoria"));
  const hasActive =
    !!params.get("categoria") || !!params.get("provincia") || !!params.get("canton") ||
    hasActiveInsurer || !!params.get("idioma") || !!params.get("precio") || !!params.get("unidadPrecio") || !!params.get("lat") ||
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

// -- MOBILE service-search bar (the "Busca un servicio..." field, pinned at the top) --
// Self-contained: manages the `q` param (PRESERVING every other param), AND autocompletes
// against OUR professions/categories taxonomy (`searchCategories`) - typing shows matching
// services; picking one filters by `categoria` (clears `q`). Same debounced free-text search
// on Enter / blur. The taxonomy is the same one the "Categoria" filter + hero use.
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
      // and searches THAT - e.g. "electrici" -> "electricista" (not a literal `q=electrici`).
      if (e.key === "Enter") { e.preventDefault(); if (debounceRef.current) clearTimeout(debounceRef.current); pickCategory(suggestions[active >= 0 ? active : 0].id); return; }
      if (e.key === "Escape") { setOpen(false); return; }
    }
    // No taxonomy match -> fall back to a literal text search (graceful).
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
