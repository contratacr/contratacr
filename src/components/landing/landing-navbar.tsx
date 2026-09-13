"use client";
import { EMPLEOS_VISIBLE } from "@/lib/feature-flags";

import { useState, useEffect, useRef, useMemo, useCallback, useTransition, type ReactNode } from "react";
import { soltarFoco } from "@/lib/soltar-foco";
import {
  X, Menu, ChevronDown, ChevronRight, Search, MapPin, List, Map as MapIcon, ArrowLeft, Share2, Bot, ReceiptText,
  Briefcase, Compass, Wrench,
  UserRound, UserRoundPlus, LogOut, FileText, MessageSquareText, Settings, Bell, MoreHorizontal,
  HelpCircle, ListChecks, Lightbulb, Headset, Globe2, Shield, Mail, ClipboardList, Clock, Bookmark,
} from "lucide-react";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { readRecentVisits, clearRecentVisits, leerBusquedasRecientesConFecha, guardarBusquedaReciente, olvidarBusquedaReciente, olvidarBusquedasRecientes, removeRecentVisit, type BusquedaReciente, type RecentVisit } from "@/lib/recent-visits";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { signOutToHome } from "@/lib/auth/sign-out";
import { useAuth } from "@/hooks/use-auth";
import { canOffer } from "@/lib/auth/capabilities";
import { useMode } from "@/hooks/use-mode";
import { AnchoredDropdown } from "@/components/ui/anchored-dropdown";
import { CategorySuggestionBox } from "@/components/ui/category-suggestion";
import { SupportLink } from "@/components/support/support-link";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { prefetchDashboardBootstrap } from "@/lib/dashboard-bootstrap-cache";
import { prefetchConversations } from "@/lib/direct-chat/conversations-cache";
import { trackMetaEvent } from "@/lib/analytics/meta-pixel";
import { useNativeApp } from "@/hooks/use-native-app";
import { ALL_CATEGORIES, CATEGORY_GROUPS, searchCategories, normalizeText, getCategoryLabel, getCategoryGroupLabel, resolveCategoryIntent, getAllCategories, getAllCategoryGroups, getCategoryGroupId } from "@/lib/data/categories";
import { getCategoryGroupIcon } from "@/lib/data/category-group-visuals";
import { useCustomCategories } from "@/lib/data/use-custom-categories";
import { allLocationSuggestions, searchLocations, resolveLocation, type LocationSuggestion } from "@/lib/data/location-search";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { createClient } from "@/lib/supabase/client";
import { repairVisibleText } from "@/lib/text/repair-visible-text";
import { OfferTagPercentIcon } from "@/components/icons/offer-tag-percent-icon";
import { useDirectMessageUnread } from "@/hooks/use-direct-message-unread";

/* --- Brand mark (the square "CR" icon) --- */
export function ContrataCRMark({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const src = tone === "dark" ? "/logo-mark-dark.png" : "/logo-mark-transparent.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="ContrataCR"
      width={28}
      height={28}
      className={cn("h-7 w-7 select-none", className)}
    />
  );
}
/* --- Logo (mark + wordmark). `size="lg"` gives the header more brand presence. --- */
export function ContrataCRLogo({ className, chip = false, size = "md", tone = "light" }: { className?: string; chip?: boolean; size?: "md" | "lg"; tone?: "light" | "dark" }) {
  const lg = size === "lg";
  const markCls = lg ? "h-8 w-8 sm:h-9 sm:w-9" : "h-7 w-7";
  const textCls = lg ? "text-[19px] sm:text-[22px]" : "text-[17px]";
  const chipCls = lg ? "h-9 w-9 sm:h-10 sm:w-10" : "h-8 w-8";
  const chipMarkCls = lg ? "h-6 w-6 sm:h-7 sm:w-7" : "h-[1.35rem] w-[1.35rem]";
  const dark = tone === "dark";
  return (
    <div className={cn("flex items-center select-none", lg ? "gap-0.5" : "gap-0.5", className)}>
      {chip ? (
        <span className={cn("grid place-items-center rounded-lg bg-white shadow-sm", chipCls)}>
          <ContrataCRMark className={chipMarkCls} />
        </span>
      ) : (
        <ContrataCRMark className={markCls} tone={tone} />
      )}
      <span className={cn("font-extrabold tracking-tight leading-none", textCls)}>
        <span className={dark ? "text-white" : "text-[#1a2744]"}>Contrata</span>
        <span className={dark ? "text-[#38bdf8]" : "text-[#009FD9]"}>CR</span>
      </span>
    </div>
  );
}

function useSlidingWords(words: string[], active: boolean) {
  const [index, setIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [sliding, setSliding] = useState(false);

  useEffect(() => {
    if (!active || words.length <= 1) {
      const frame = window.requestAnimationFrame(() => setSliding(false));
      return () => window.cancelAnimationFrame(frame);
    }
    let settleTimer: number | null = null;
    const id = window.setInterval(() => {
      setCycle((current) => current + 1);
      setSliding(true);
      settleTimer = window.setTimeout(() => {
        setIndex((current) => (current + 1) % words.length);
        setSliding(false);
      }, 520);
    }, 2200);
    return () => {
      window.clearInterval(id);
      if (settleTimer) window.clearTimeout(settleTimer);
    };
  }, [active, words.length]);

  const current = words[index] ?? words[0] ?? "";
  const next = words[(index + 1) % words.length] ?? current;
  return { current, next, cycle, sliding };
}

export function useSwitchLang() {
  const router = useRouter();
  const pathname = usePathname();
  const currentSearchParams = useSearchParams();
  const locale = useLocale();
  const [, startTransition] = useTransition();
  const otroIdioma = locale === "en" ? "es" : "en";

  // Con la ruta ya precargada el cambio es un intercambio de texto, no una carga.
  useEffect(() => {
    router.prefetch(pathname, { locale: otroIdioma });
  }, [otroIdioma, pathname, router]);

  useEffect(() => {
    document.documentElement.removeAttribute("data-locale-switch");
  }, [locale]);

  return (lang: string) => {
    const currentState =
      typeof window === "undefined" ? "" : `${window.location.search}${window.location.hash}`;
    if (typeof window !== "undefined") {
      // Cookie de SESIÓN (sin max-age): el idioma elegido vale para esta visita
      // —lo lee el middleware para las direcciones sin prefijo— y se borra al
      // cerrar la app o el navegador, así que la próxima entrada vuelve a
      // español. Tampoco se guarda en localStorage, que sobrevive al cierre.
      document.cookie = `NEXT_LOCALE=${lang}; path=/; samesite=lax`;
      document.documentElement.setAttribute("data-locale-switch", "1");
      window.setTimeout(() => document.documentElement.removeAttribute("data-locale-switch"), 2500);
    }
    startTransition(() => {
      router.replace(`${pathname}${currentState}`, { locale: lang, scroll: false });
    });
  };
}

/* --- Language menu (DESKTOP navbar) --- */
function LanguageMenu() {
  const locale = useLocale();
  const switchLang = useSwitchLang();
  const nextLocale = locale === "en" ? "es" : "en";
  const label = nextLocale.toUpperCase();

  return (
    <button
      type="button"
      onClick={() => switchLang(nextLocale)}
      aria-label={locale === "en" ? "Cambiar a español" : "Switch to English"}
      className="relative z-[70] inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full px-2 text-[12px] font-bold uppercase tracking-[0.04em] text-[#1A2744] transition-colors hover:bg-gray-50 hover:text-[#009FD9]"
    >
      {label}
    </button>
  );
}

/* --- Mode segmented control (Cliente / Profesional)
   The canonical pattern for switching between two views/contexts: BOTH modes
   shown side by side, the active one FILLED (brand), the inactive one muted but
   clearly tappable - tapping it switches the whole experience. (Carbon-style
   content switcher / iOS segmented control.) Accessible (role=tablist/tab,
   ArrowLeft/Right operable), smooth fill transition, fits the navbar at ~360px.
   `block` makes the two segments share the full width (used in the account menu
   + mobile drawer); the inline default is used in the navbar bar.
   NO notification badge - context switchers stay clean; notifications live in the
   bell (modern-app practice). */
/* In the navbar itself we still keep one compact account entry point. Inside that
   account menu/drawer, providers can switch Cliente/Profesional in place. */

/* --- Header data ---
   The "Categorias" mega-menu (desktop) is built from the FULL catalog `CATEGORY_GROUPS`
   (sprint 525) - every group + its categories, organized with group headers. On mobile the
   drawer shows just a single "Servicios" link -> /servicios. */

// `key` resolves to header.resourceLinks.<key> for the translated label.
const RESOURCES_LINKS: { key: string; href: string }[] = [
  { key: "howItWorks", href: "/como-funciona" },
  { key: "helpCenter", href: "/ayuda" },
  { key: "proTips",    href: "/atraer-clientes" },
  { key: "support",    href: "/soporte" },
];

const CURRENT_LOCATION_STORAGE_KEY = "contratacr_current_location_hint";

const CANTON_CENTER_HINTS: Record<string, { lat: number; lng: number }> = {
  "sj-sj": { lat: 9.932, lng: -84.08 },
  "sj-es": { lat: 9.918, lng: -84.139 },
  "sj-de": { lat: 9.899, lng: -84.061 },
  "sj-sa": { lat: 9.932, lng: -84.182 },
  "sj-go": { lat: 9.948, lng: -84.056 },
  "sj-ti": { lat: 9.958, lng: -84.079 },
  "sj-mo2": { lat: 9.963, lng: -84.048 },
  "sj-mu": { lat: 9.936, lng: -84.051 },
  "sj-cu": { lat: 9.911, lng: -84.034 },
  "al-al": { lat: 10.016, lng: -84.214 },
  "al-at": { lat: 9.979, lng: -84.379 },
  "al-gr": { lat: 10.073, lng: -84.312 },
  "al-sa": { lat: 10.088, lng: -84.47 },
  "al-sc": { lat: 10.323, lng: -84.428 },
  "ca-ca": { lat: 9.864, lng: -83.919 },
  "ca-lu": { lat: 9.907, lng: -83.987 },
  "ca-pa": { lat: 9.838, lng: -83.865 },
  "he-he": { lat: 9.998, lng: -84.117 },
  "he-be": { lat: 9.978, lng: -84.183 },
  "he-fl": { lat: 10.0, lng: -84.158 },
  "he-sa2": { lat: 10.456, lng: -84.016 },
  "gu-li": { lat: 10.635, lng: -85.437 },
  "gu-ni": { lat: 10.148, lng: -85.452 },
  "gu-sc": { lat: 10.262, lng: -85.586 },
  "pu-pu": { lat: 9.977, lng: -84.833 },
  "pu-es": { lat: 9.994, lng: -84.665 },
  "pu-ag": { lat: 9.431, lng: -84.162 },
  "li-li": { lat: 9.991, lng: -83.036 },
  "li-po": { lat: 10.217, lng: -83.785 },
  "li-si": { lat: 9.991, lng: -83.67 },
};

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function provinceSuggestions() {
  return allLocationSuggestions().filter(
    (suggestion): suggestion is Extract<LocationSuggestion, { type: "province" }> => suggestion.type === "province",
  );
}

function nearbyLocationSuggestions(coords: { latitude: number; longitude: number }, limit = 7): LocationSuggestion[] {
  const all = allLocationSuggestions();
  const byId = new Map(all.map((suggestion) => [suggestion.id, suggestion]));
  const nearestCantons = Object.entries(CANTON_CENTER_HINTS)
    .map(([id, center]) => ({ id, distance: distanceKm({ lat: coords.latitude, lng: coords.longitude }, center) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.max(1, limit - 1))
    .map(({ id }) => byId.get(id))
    .filter((suggestion): suggestion is LocationSuggestion => Boolean(suggestion));
  const firstCanton = nearestCantons.find(
    (suggestion): suggestion is Extract<LocationSuggestion, { type: "canton" }> => suggestion.type === "canton",
  );
  const province = firstCanton ? byId.get(firstCanton.provinceId) : null;
  return [firstCanton, ...nearestCantons.filter((suggestion) => suggestion.id !== firstCanton?.id), province]
    .filter((suggestion): suggestion is LocationSuggestion => Boolean(suggestion))
    .filter((suggestion, index, list) => list.findIndex((item) => item.id === suggestion.id) === index)
    .slice(0, limit);
}

function orderCurrentLocationSuggestions(suggestions: LocationSuggestion[], coords: { latitude: number; longitude: number }, limit = 7): LocationSuggestion[] {
  const byId = new Map(allLocationSuggestions().map((suggestion) => [suggestion.id, suggestion]));
  const distanceFor = (suggestion: LocationSuggestion) => {
    const center = CANTON_CENTER_HINTS[suggestion.id as keyof typeof CANTON_CENTER_HINTS];
    return center ? distanceKm({ lat: coords.latitude, lng: coords.longitude }, center) : Number.POSITIVE_INFINITY;
  };
  const cantons = suggestions
    .filter((suggestion): suggestion is Extract<LocationSuggestion, { type: "canton" }> => suggestion.type === "canton")
    .sort((a, b) => distanceFor(a) - distanceFor(b));
  const nearestCanton = cantons[0];
  const nearestProvince = nearestCanton ? byId.get(nearestCanton.provinceId) : null;
  const provinces = [
    nearestProvince,
    ...suggestions.filter((suggestion): suggestion is Extract<LocationSuggestion, { type: "province" }> => suggestion.type === "province"),
  ].filter((suggestion): suggestion is LocationSuggestion => Boolean(suggestion));

  return [...cantons, ...provinces]
    .filter((suggestion, index, list) => list.findIndex((item) => item.id === suggestion.id) === index)
    .slice(0, limit);
}

async function currentLocationSuggestionsFromCoords(coords: { latitude: number; longitude: number }): Promise<LocationSuggestion[]> {
  const nearby = nearbyLocationSuggestions(coords);
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=es`,
      { cache: "no-store" },
    );
    if (!response.ok) return nearby;
    const data = (await response.json()) as {
      city?: string;
      locality?: string;
      principalSubdivision?: string;
      localityInfo?: { administrative?: Array<{ name?: string; adminLevel?: number }> };
    };
    const names = [
      data.city,
      data.locality,
      ...(data.localityInfo?.administrative ?? []).map((item) => item.name),
      data.principalSubdivision,
    ].filter((name): name is string => typeof name === "string" && name.trim().length > 0);
    const resolved = names.flatMap((name) => searchLocations(name, 2));
    return orderCurrentLocationSuggestions([...resolved, ...nearby], coords, 7);
  } catch {
    return nearby;
  }
}

/* --- Accent- and typo-tolerant category matcher ---
   `searchCategories` already does accent-insensitive substring matching over
   labels + keywords; if that yields nothing we fall back to a small edit-
   distance match so minor typos ("plomeria"->"plomeira", "electicidad") still
   resolve. ALL_CATEGORIES is ~90 items, so this stays cheap. */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[m][n];
}

type CatMatch = (typeof ALL_CATEGORIES)[number];
function matchCategories(query: string, limit = 8, locale?: string): CatMatch[] {
  if (!query.trim()) return [];
  const direct = searchCategories(query, locale);
  if (direct.length) return direct.slice(0, limit);
  const needle = normalizeText(query.trim());
  const tol = needle.length > 6 ? 2 : 1;
  return getAllCategories()
    .map((item) => {
      const words = normalizeText(`${getCategoryLabel(item.id, locale)} ${item.label}`).split(/\s+/);
      const comparableWords = words.filter((w) => Math.abs(w.length - needle.length) <= 1);
      const best = comparableWords.length ? Math.min(...comparableWords.map((w) => editDistance(w, needle))) : Number.POSITIVE_INFINITY;
      return { item, best };
    })
    .filter((x) => x.best <= tol)
    .sort((a, b) => a.best - b.best)
    .slice(0, limit)
    .map((x) => x.item);
}

/* --- Categorias mega-menu panel ---
   ONE clean container: the search field FILTERS the curated category list IN PLACE as
   you type - never a second floating dropdown stacked on top of the mega-menu. Empty ->
   the curated 3-column grid; typing -> matching categories inline; no match -> the shared
   suggest flow + a clean "Ver todos". */
function CategoriesMegaPanel({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations("header");
  const ts = useTranslations("categorySearch");
  const tp = useTranslations("categoriesPage");
  const locale = useLocale();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [selectedGroupId, setSelectedGroupId] = useState(CATEGORY_GROUPS[0]?.id ?? "");
  const [searchGroupSelection, setSearchGroupSelection] = useState<{ query: string; id: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useCustomCategories();
  const menuCategories = getAllCategories();
  const menuGroups = getAllCategoryGroups().map((group) => ({
    id: group.id,
    iconKey: group.iconKey,
    items: menuCategories.filter((category) => category.groupId === group.id),
  }));
  const matches = matchCategories(q, 18, locale);
  const filtering = q.trim().length > 0;
  const selectedGroup = menuGroups.find((group) => group.id === selectedGroupId) ?? menuGroups[0];
  const groupedMatches = menuGroups
    .map((group) => ({ group, items: matches.filter((match) => match.groupId === group.id) }))
    .filter(({ items }) => items.length > 0)
    .sort((a, b) => {
      const firstA = Math.min(...a.items.map((item) => matches.findIndex((match) => match.id === item.id)));
      const firstB = Math.min(...b.items.map((item) => matches.findIndex((match) => match.id === item.id)));
      return firstA - firstB;
    });
  const firstMatchGroupId = groupedMatches[0]?.group.id ?? "";
  const normalizedSearchQuery = normalizeText(q.trim());
  const selectedSearchGroupId =
    searchGroupSelection?.query === normalizedSearchQuery
      ? searchGroupSelection.id
      : firstMatchGroupId;

  useEffect(() => { queueMicrotask(() => setActive(0)); }, [q]);

  function go(id?: string) {
    if (id) router.push(`/buscar?categoria=${id}`);
    else if (q.trim()) router.push(`/buscar?q=${encodeURIComponent(q.trim())}`);
    else router.push("/buscar");
    setQ("");
    onNavigate();
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (!filtering || matches.length === 0) {
      if (e.key === "Enter") { e.preventDefault(); go(); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(matches[active]?.id); }
    else if (e.key === "Escape") { setQ(""); }
  }

  return (
    <div className="flex max-h-[calc(100vh-7rem)] min-h-0 flex-col overflow-hidden">
      {/* Search - inline; typing filters the list below IN PLACE (no portal/overlay). */}
      <div className="mb-4 flex h-11 shrink-0 items-center rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 transition-all focus-within:border-[#009FD9] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#009FD9]/20">
        <Search className="h-4 w-4 shrink-0 text-gray-400" />
        <input
          data-testid="services-mega-menu-search"
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("searchServicePlaceholder")}
          aria-label={t("searchServiceAria")}
          className="ml-2 min-w-0 flex-1 bg-transparent text-base sm:text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
        />
        {q && (
          <button type="button" onClick={() => { setQ(""); inputRef.current?.focus(); }} className="ml-2 text-gray-400 hover:text-gray-600" aria-label={ts("cancel")}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {filtering ? (
        matches.length > 0 ? (
          <div className="grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)] overflow-hidden rounded-2xl border border-[#eef2f6] bg-white shadow-[0_18px_45px_-36px_rgba(15,23,42,0.45)]">
            <div className="min-w-0 overflow-y-auto overscroll-contain border-r border-[#eef2f6] bg-[#f8fafc] p-2">
              {groupedMatches.map(({ group, items }) => {
                const Icon = getCategoryGroupIcon(group.id, group.iconKey);
                const selected = selectedSearchGroupId === group.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSearchGroupSelection({ query: normalizedSearchQuery, id: group.id })}
                    onMouseEnter={() => setSearchGroupSelection({ query: normalizedSearchQuery, id: group.id })}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/20",
                      selected ? "bg-white text-[#162543] shadow-sm" : "text-[#526173] hover:bg-white/80 hover:text-[#162543]"
                    )}
                  >
                    <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", selected ? "bg-[#EAF7FD] text-[#0089bb]" : "bg-white text-[#8a94a6] group-hover:text-[#0089bb]")}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold leading-snug">{getCategoryGroupLabel(group.id, locale)}</span>
                      <span className="mt-0.5 block text-[11px] font-medium text-[#68778d]">{ts("optionsCount", { count: items.length })}</span>
                    </span>
                    <ChevronRight className={cn("h-4 w-4 shrink-0", selected ? "text-[#009FD9]" : "text-[#cbd5e1]")} />
                  </button>
                );
              })}
            </div>
            <div className="min-w-0 overflow-y-auto overscroll-contain p-4">
              {(() => {
                const activeGroup = groupedMatches.find(({ group }) => group.id === selectedSearchGroupId) ?? groupedMatches[0];
                if (!activeGroup) return null;
                return (
                  <section>
                    <div className="mb-3 min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[#8a94a6]">{t("categories")}</p>
                      <h3 className="mt-0.5 truncate text-lg font-extrabold text-[#162543]">{getCategoryGroupLabel(activeGroup.group.id, locale)}</h3>
                      <p className="mt-0.5 text-[11px] font-medium text-[#68778d]">{ts("optionsCount", { count: activeGroup.items.length })}</p>
                    </div>
                    <div className={`grid gap-1.5 ${activeGroup.items.length === 1 ? "max-w-[260px] grid-cols-1" : "grid-cols-2"}`}>
                      {activeGroup.items.map((m) => {
                        const flatIndex = matches.findIndex((match) => match.id === m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => go(m.id)}
                            onMouseEnter={() => setActive(flatIndex)}
                            className={cn(
                              "group flex min-h-10 items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold leading-snug transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/20",
                              flatIndex === active ? "bg-[#EBF5FB] text-[#0089bb]" : "text-[#374151] hover:bg-[#EBF5FB] hover:text-[#0089bb]"
                            )}
                          >
                            <span className="min-w-0 [overflow-wrap:anywhere]">{getCategoryLabel(m.id, locale)}</span>
                            <ChevronRight className={cn("h-4 w-4 shrink-0", flatIndex === active ? "text-[#009FD9]" : "text-[#cbd5e1] group-hover:text-[#009FD9]")} />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })()}
            </div>
          </div>
        ) : (
          // No match -> consistent wording + the shared suggest flow, all INSIDE this same
          // container. The "Ver todos los profesionales" link was removed (sprint 305).
          <div className="py-2 text-center">
            <p className="text-sm font-extrabold text-[#162543]">{tp("notListed")}</p>
            <p className="mx-auto mt-0.5 max-w-sm text-xs leading-relaxed text-[#6b7280]">{tp("suggestDescription")}</p>
            <div className="mx-auto mt-3 flex justify-center">
              <CategorySuggestionBox
                prominent
                defaultName={q}
                notListedLabel={tp("suggestCta")}
                placeholder={tp("suggestPlaceholder")}
                sendLabel={tp("suggestSend")}
                sendingLabel={tp("suggestSending")}
                cancelLabel={ts("cancel")}
                thanksLabel={tp("suggestThanks")}
              />
            </div>
          </div>
        )
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[16.5rem_minmax(0,1fr)] overflow-hidden rounded-2xl border border-[#eef2f6] bg-white shadow-[0_18px_45px_-36px_rgba(15,23,42,0.45)]">
          <div className="min-w-0 overflow-y-auto overscroll-contain border-r border-[#eef2f6] bg-[#f8fafc] p-2">
            {menuGroups.map((group) => {
              const Icon = getCategoryGroupIcon(group.id, group.iconKey);
              const selected = selectedGroup?.id === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setSelectedGroupId(group.id)}
                  onMouseEnter={() => setSelectedGroupId(group.id)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/20",
                    selected ? "bg-white text-[#162543] shadow-sm" : "text-[#526173] hover:bg-white/80 hover:text-[#162543]"
                  )}
                >
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", selected ? "bg-[#EAF7FD] text-[#0089bb]" : "bg-white text-[#8a94a6] group-hover:text-[#0089bb]")}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold leading-snug">{getCategoryGroupLabel(group.id, locale)}</span>
                    <span className="mt-0.5 block text-[11px] font-medium text-[#68778d]">{ts("optionsCount", { count: group.items.length })}</span>
                  </span>
                  <ChevronRight className={cn("h-4 w-4 shrink-0", selected ? "text-[#009FD9]" : "text-[#cbd5e1]")} />
                </button>
              );
            })}
          </div>
          <div className="min-w-0 overflow-y-auto overscroll-contain p-4">
            {selectedGroup && (
              <section>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#8a94a6]">{t("categories")}</p>
                    <h3 className="mt-0.5 truncate text-lg font-extrabold text-[#162543]">{getCategoryGroupLabel(selectedGroup.id, locale)}</h3>
                  </div>
                  {selectedGroup.items.length > 0 && (
                    <Link
                      href="/servicios"
                      onClick={onNavigate}
                      className="shrink-0 text-xs font-bold text-[#009FD9] hover:underline"
                    >
                      {t("viewAllCategories")}
                    </Link>
                  )}
                </div>
                {selectedGroup.items.length > 0 ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    {selectedGroup.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => go(item.id)}
                        className="group flex min-h-10 items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold leading-snug text-[#374151] transition-colors hover:bg-[#EBF5FB] hover:text-[#0089bb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/20"
                      >
                        <span className="min-w-0 [overflow-wrap:anywhere]">{getCategoryLabel(item.id, locale)}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#cbd5e1] group-hover:text-[#009FD9]" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-[#f8fafc] px-3 py-4 text-sm font-medium text-[#8a94a6]">
                    {locale === "en" ? "This section does not have published services yet." : "Esta sección todavía no tiene servicios publicados."}
                  </p>
                )}
              </section>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 shrink-0 border-t border-gray-100 pt-3">
        <Link
          href="/servicios"
          onClick={onNavigate}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#009FD9] hover:underline"
        >
          <Compass className="h-4 w-4" />
          {t("viewAllCategories")}
        </Link>
      </div>
    </div>
  );
}

/* --- Account menu (avatar trigger + dropdown) ---
   Self-contained: owns its open state + tap-away handling, so it can be
   rendered in BOTH the default header row AND the compact/scrolled row
   without sharing state. */
interface AccountMenuProps {
  isPro: boolean;
  displayName: string;
  professionalPanelHref: string;
  clientPanelHref: string;
  savedHref: string;
  profileHref: string;
  projectsHref: string;
  onSignOut: () => void;
}

export function AccountMenu({
  isPro, displayName, professionalPanelHref, clientPanelHref, profileHref, projectsHref, savedHref, onSignOut,
}: AccountMenuProps) {
  const t = useTranslations("header");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuItemClass = "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#1A2744] transition-colors hover:bg-[#f3f4f6] hover:text-[#009FD9]";

  useEffect(() => {
    function onClickOutside(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("touchstart", onClickOutside);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("touchstart", onClickOutside);
    };
  }, []);

  function toggle() {
    setOpen((o) => !o);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        className="grid h-10 w-10 place-items-center rounded-xl text-[#1A2744] transition-colors hover:bg-[#f3f4f6] hover:text-[#009FD9]"
        aria-label={displayName || t("myPanel")}
      >
        <UserRound className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 max-h-[min(720px,calc(100vh-92px))] w-72 overflow-y-auto bg-white border border-gray-100 rounded-2xl shadow-[0_22px_55px_-18px_rgba(15,23,42,0.45)] z-50 py-1.5">
          <div className="mb-1 border-b border-gray-100 px-3 py-2.5">
            <p className="truncate text-sm font-bold text-[#162543]">{displayName || t("myPanel")}</p>
          </div>

          <div className="pt-1">
            <Link
              href={isPro ? professionalPanelHref : clientPanelHref}
              onClick={() => setOpen(false)}
              className={menuItemClass}
            >
              <UserRound className="h-4 w-4 text-[#009FD9]" />
              {t("myPanel")}
            </Link>
            <Link href={`${projectsHref}&openPublish=1`} onClick={() => setOpen(false)} className={menuItemClass}>
              <ClipboardList className="h-4 w-4 text-[#009FD9]" />
              {t("publishRequest")}
            </Link>
            {!isPro && (
              <Link href={projectsHref} onClick={() => setOpen(false)} className={menuItemClass}>
                <ClipboardList className="h-4 w-4 text-[#009FD9]" />
                {t("projects")}
              </Link>
            )}
            {/* Cotizar es lo que el profesional hace seguido: en la app está en
                la barra de abajo y aquí, en la web, en su menú. */}
            {isPro && (
              <Link href={`${professionalPanelHref.split("?")[0]}?mode=offer&tab=quotes`} onClick={() => setOpen(false)} className={menuItemClass}>
                <ReceiptText className="h-4 w-4 text-[#009FD9]" />
                {t("quotes")}
              </Link>
            )}
            <Link href={savedHref} onClick={() => setOpen(false)} className={menuItemClass}>
              <Bookmark className="h-4 w-4 text-[#009FD9]" />
              {t("favorites")}
            </Link>
            <Link
              href={profileHref}
              onClick={() => setOpen(false)}
              className={menuItemClass}
            >
              <Settings className="h-4 w-4 text-[#009FD9]" />
              {locale === "en" ? "Profile and account" : "Perfil y cuenta"}
            </Link>
          </div>

          <button
            onClick={onSignOut}
            className="mt-1 flex w-full items-center gap-2.5 border-t border-gray-100 px-3 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            {locale === "en" ? "Sign out" : "Cerrar sesión"}
          </button>
        </div>
      )}
    </div>
  );
}

/* --- Navbar ---
   `mobileInline` (optional): content injected into the MOBILE header row only (<lg),
   between the logo and the hamburger - used by /buscar to put the search + filters on the
   SAME single line as the logo + menu. When present, the mobile logo compacts to the mark
   (the wordmark would crowd the row at ~360px). Desktop + pages that don't pass it are
   unchanged. */
function PanelIconLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-xl text-[#1A2744]"
    >
      <UserRound className="h-5 w-5" />
    </Link>
  );
}

// Sin sesión los avisos siguen visibles: llevan a la pantalla de acceso y de
// ahí a lo que se quiso abrir, en vez de desaparecer del encabezado.
export function HeaderNotificationsLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="relative grid h-10 w-10 place-items-center rounded-xl text-[#1A2744] transition-colors hover:bg-[#f3f4f6] hover:text-[#009FD9]"
    >
      <Bell className="h-5 w-5" />
    </Link>
  );
}

export function HeaderMessagesLink({ unreadCount, label, href = "/mensajes" }: { unreadCount: number; label: string; href?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="relative grid h-10 w-10 place-items-center rounded-xl text-[#1A2744] transition-colors hover:bg-[#f3f4f6] hover:text-[#009FD9]"
    >
      <span className="relative inline-flex">
        <MessageSquareText className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#009FD9] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </span>
    </Link>
  );
}

function DrawerIcon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-[#162543] [&>svg]:h-6 [&>svg]:w-6">
      {children}
    </span>
  );
}

function ResourceIcon({ name, className = "h-5 w-5 shrink-0" }: { name: string; className?: string }) {
  if (name === "howItWorks") return <ListChecks className={className} />;
  if (name === "helpCenter") return <HelpCircle className={className} />;
  if (name === "proTips") return <Lightbulb className={className} />;
  if (name === "contact") return <Mail className={className} />;
  if (name === "terms") return <FileText className={className} />;
  if (name === "privacy") return <Shield className={className} />;
  return <Headset className={className} />;
}

// Lo que la dirección de /buscar dice sobre la búsqueda en curso, en un solo
// lugar, para que el primer pintado de la barra ya lo lleve puesto.
function contextoDeBusquedaDesdeUrl(params: { get(name: string): string | null }, locale: string) {
  const categoriaId = params.get("categoria");
  const grupoId = params.get("grupo");
  const grupoLabel = grupoId && getAllCategoryGroups().some((group) => group.id === grupoId)
    ? getCategoryGroupLabel(grupoId, locale)
    : "";
  const servicioExplicito =
    categoriaId && categoriaId !== "todas"
      ? getCategoryLabel(categoriaId, locale)
      : grupoLabel || params.get("q")?.trim() || "";
  const cantonId = params.get("canton");
  const provinciaId = params.get("provincia");
  const ubicacionSel = cantonId
    ? allLocationSuggestions().find((location) => location.type === "canton" && location.id === cantonId) ?? null
    : provinciaId
      ? allLocationSuggestions().find((location) => location.type === "province" && location.id === provinciaId) ?? null
      : null;
  const ubicacion = params.get("ubicacion")?.trim() ||
    (ubicacionSel?.type === "canton" ? `${ubicacionSel.label}, ${ubicacionSel.sublabel}` : ubicacionSel?.label ?? "");
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  return {
    // Una familia entera («Agro») no se escribe en el campo: queda como contexto.
    servicio: grupoLabel ? "" : servicioExplicito,
    categoriaId: categoriaId && categoriaId !== "todas" ? categoriaId : null,
    ubicacion,
    ubicacionSel,
    coords: params.get("lat") && params.get("lng") && Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null,
  };
}

export function LandingNavbar({ mobileInline, forceCompactSearch = false, mobileSearch = false, marketplaceDesktop = false, drawerOnly = false }: { mobileInline?: React.ReactNode; forceCompactSearch?: boolean; mobileSearch?: boolean; marketplaceDesktop?: boolean; drawerOnly?: boolean } = {}) {
  const [compact, setCompact] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileHelpOpen, setMobileHelpOpen] = useState(false);
  const [nativePendingHref, setNativePendingHref] = useState<string | null>(null);
  const locale = useLocale();
  const pathname = usePathname();
  const currentSearchParams = useSearchParams();
  // En /buscar el campo de la barra nace YA con lo que dice la dirección. Antes
  // nacía vacío y un efecto lo llenaba tras el primer pintado: se veía el texto
  // de ayuda («Servicio») y un instante después el oficio buscado. El efecto de
  // abajo sigue leyendo la dirección al navegar; aquí solo se adelanta el primer cuadro.
  const contextoInicial = pathname === "/buscar" ? contextoDeBusquedaDesdeUrl(currentSearchParams, locale) : null;
  const [searchQuery, setSearchQuery] = useState(contextoInicial?.servicio ?? "");
  const [searchListDominant, setSearchListDominant] = useState(false);
  useCustomCategories();
  // A picked category (so a chosen suggestion filters by id, not free text).
  const [searchCategoryId, setSearchCategoryId] = useState<string | null>(contextoInicial?.categoriaId ?? null);
  const [searchActiveIdx, setSearchActiveIdx] = useState(-1);
  const [searchFocused, setSearchFocused] = useState(false);
  const [nativeSearchOpen, setNativeSearchOpen] = useState(false);
  const [busquedasRecientes, setBusquedasRecientes] = useState<BusquedaReciente[]>([]);
  const [visitasRecientes, setVisitasRecientes] = useState<RecentVisit[]>([]);
  const [currentLocationSuggestions, setCurrentLocationSuggestions] = useState<LocationSuggestion[] | null>(null);
  const [navCurrentCoords, setNavCurrentCoords] = useState<{ latitude: number; longitude: number } | null>(contextoInicial?.coords ?? null);
  // Location is a typeable autocomplete (provinces + cantones), like the hero.
  const [navLocation, setNavLocation] = useState(contextoInicial?.ubicacion ?? "");
  const [navLocationSel, setNavLocationSel] = useState<LocationSuggestion | null>(contextoInicial?.ubicacionSel ?? null);
  const [navLocOpen, setNavLocOpen] = useState(false);
  const [navLocActive, setNavLocActive] = useState(-1);
  const navLocBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compactSvcRef = useRef<HTMLDivElement>(null);
  const compactLocRef = useRef<HTMLDivElement>(null);
  const nativeSearchInputRef = useRef<HTMLInputElement>(null);
  // Campo puente para el teclado: ver openNativeSearch.
  const puenteTecladoRef = useRef<HTMLInputElement>(null);
  const nativeLocationInputRef = useRef<HTMLInputElement>(null);
  const navLocationInputRef = useRef<HTMLInputElement>(null);
  const nativePendingTimer = useRef<number | null>(null);
  // Drives a SHORTER search placeholder on small screens so it never clips.
  const [isSmallScreen, setIsSmallScreen] = useState(true);
  const searchBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const servicesMenuRef = useRef<HTMLDivElement>(null);
  const exploreMenuRef = useRef<HTMLDivElement>(null);
  const resourcesMenuRef = useRef<HTMLDivElement>(null);
  const drawerTouchX = useRef<number | null>(null);
  const router = useRouter();
  const t = useTranslations("header");
  const tNav = useTranslations("bottomNav");
  const switchLang = useSwitchLang();
  const alternateLocale = locale === "en" ? "es" : "en";
  const alternateLanguageLabel = locale === "en" ? "Español" : "English";
  const nativeApp = useNativeApp();
  // En la app, la línea y la sombra de la barra solo se retiran cuando debajo
  // hay un lienzo de OTRO color que ya separa por sí solo (el gris del panel,
  // el mapa de /buscar). Sobre contenido blanco la línea se queda: sin ella no
  // habría ninguna división entre la barra y la página.
  const [contenidoDebajo, setContenidoDebajo] = useState(false);
  const [lienzoBlanco, setLienzoBlanco] = useState(true);
  useEffect(() => {
    if (!nativeApp) return;
    const transparente = /rgba\(0, 0, 0, 0\)|transparent/;
    const fondoDe = (desde: Element | null): string | null => {
      let nodo: Element | null = desde;
      while (nodo) {
        const fondo = getComputedStyle(nodo).backgroundColor;
        if (fondo && !transparente.test(fondo)) return fondo;
        nodo = nodo.parentElement;
      }
      return null;
    };
    const medir = () => {
      const barra = document.querySelector(".ccr-app-header");
      if (!barra) return;
      const r = barra.getBoundingClientRect();
      if (r.height === 0) return;
      const debajo = fondoDe(document.elementFromPoint(16, Math.round(r.bottom + 4)));
      setLienzoBlanco(!debajo || debajo === "rgb(255, 255, 255)");
    };
    const cuadro = requestAnimationFrame(() => requestAnimationFrame(medir));
    const tarde = window.setTimeout(medir, 700);
    window.addEventListener("resize", medir);
    return () => {
      cancelAnimationFrame(cuadro);
      window.clearTimeout(tarde);
      window.removeEventListener("resize", medir);
    };
  }, [nativeApp, pathname]);
  useEffect(() => {
    if (!nativeApp) return;
    const leer = (objetivo: EventTarget | null): number | null => {
      if (objetivo === document || objetivo === window) {
        return (document.scrollingElement ?? document.documentElement).scrollTop;
      }
      if (objetivo instanceof HTMLElement && objetivo.tagName === "MAIN") return objetivo.scrollTop;
      return null;
    };
    const onScroll = (evento: Event) => {
      const arriba = leer(evento.target);
      if (arriba !== null) setContenidoDebajo(arriba > 4);
    };
    const principal = document.querySelector("main");
    queueMicrotask(() => setContenidoDebajo(((document.scrollingElement?.scrollTop ?? 0) > 4) || ((principal?.scrollTop ?? 0) > 4)));
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, [nativeApp]);
  const nativeMessageUnread = useDirectMessageUnread(nativeApp);
  const [hydrated, setHydrated] = useState(false);
  const nativeHeaderShell = hydrated && nativeApp;
  const { user, loading: authLoading, accountName } = useAuth();
  const nativeSearchRoute = /(^|\/)buscar(?:\/|$)/.test(pathname ?? "");
  // Search is a full-viewport map + results sheet. Do not merely hide the nav
  // with CSS: leaving it mounted keeps its layout class and safe-area reserve
  // active, which shortens the sheet and the full-screen search overlay.
  const accesoHref = (destino: string) => `/login?redirect=${encodeURIComponent(`/${locale}${destino}`)}`;
  const enMensajes = /(^|\/)mensajes(?:\/|$)/.test(pathname ?? "");
  const enNotificaciones = /(^|\/)notificaciones(?:\/|$)/.test(pathname ?? "");
  const nativeFullscreenRoute = /(^|\/)(?:publicar-proyecto|(?:empleos|ofertas)\/publicar)(?:\/|$)/.test(pathname ?? "");
  const [accountCapability, setAccountCapability] = useState<{
    userId: string;
    role: string | null;
    hasProfessionalProfile: boolean;
    capabilityKnown: boolean;
    businessName: string;
  } | null>(null);
  // Depending on whether this render comes from an i18n client transition or a
  // hard refresh, usePathname can expose the home route as `/` or with its
  // locale prefix (`/es`, `/en`). Treat all three as home so the compact search
  // is controlled only by the hero sentinel, never by the URL representation.
  // next-intl mirrors Next's runtime behavior and can briefly return null while
  // the client pathname settles. Default that unknown state to the safest home
  // behavior so the compact search never flashes during hydration/refresh.
  const isHomePage = !pathname || pathname === "/" || /^\/(?:es|en)\/?$/.test(pathname);
  const isMarketplaceEditor = /\/(?:empleos|ofertas)\/(?:publicar|[^/]+\/editar)\/?$/.test(pathname);
  const isMarketplaceRoute = /\/(?:empleos|ofertas)(?:\/|$)/.test(pathname);
  const effectiveMarketplaceDesktop = marketplaceDesktop || (isMarketplaceRoute && !isMarketplaceEditor);
  // Empleos, ofertas y /buscar traen sus propios filtros pegados a la barra: la
  // línea de la barra caía justo encima de ellos y se leía como una raya suelta.
  const rutaConFiltrosPegados = (isMarketplaceRoute && !isMarketplaceEditor) || /\/buscar(?:\/|$)/.test(pathname ?? "");
  const compactEnabled = true;
  const effectiveCompact = compactEnabled && (forceCompactSearch || !isHomePage || compact);
  // En escritorio el buscador compacto del navbar aparece en el home al pasar el
  // hero y SIEMPRE en el resto de páginas públicas (perfil, oficios, ayuda…).
  // Se oculta donde no hay nada que buscar: panel, admin, cuenta, mensajes,
  // reservar, y los tableros de empleos/ofertas, que traen su propio buscador.
  const rutaSinBuscador = drawerOnly || /\/(?:admin|login|registro|onboarding|mensajes|notificaciones|reset-password|olvide-contrasena|completar-perfil|eliminar-cuenta|publicar-proyecto)(?:\/|$)|\/reservar(?:\/|$)/.test(pathname ?? "");
  const showDesktopCompactSearch = effectiveCompact && !effectiveMarketplaceDesktop && !rutaSinBuscador;
  // The global navbar is navigation-only. /buscar explicitly opts into its
  // contextual professional search; every other destination owns its search.
  const showMobileNavbarSearch = mobileSearch && effectiveCompact && !mobileInline;
  // En el teléfono, al pasar el hero del home el buscador se mete en la barra:
  // antes solo pasaba en escritorio y en el teléfono la barra quedaba vacía al
  // bajar. Va DENTRO del renglón (el logotipo se reduce a la marca) para que la
  // barra no crezca a mitad del scroll y empuje la página.
  const buscadorHomeMovilBase = isHomePage && compact && !mobileInline && !rutaSinBuscador && !showMobileNavbarSearch;
  const showSearchViewToggle = showMobileNavbarSearch && pathname === "/buscar";

  // The layout below the navbar is sized by --ccr-native-header-height. Setting it
  // only from the effect above meant the server-rendered page used the 64px default
  // while the mobile navbar with its search box is 124px tall: everything under it
  // jumped 60px the moment hydration ran (a 0.15 layout shift on every /buscar open).
  // Declaring it in CSS whenever this navbar variant is rendered makes the first
  // paint right; the effect keeps it right on resize.
  const headerHeightStyle = showMobileNavbarSearch
    ? "@media (max-width: 1023px) { :root { --ccr-native-header-height: 124px; } .ccr-navbar-spacer { height: 124px; } main { scroll-padding-top: 124px; } }"
    : null;
  useEffect(() => {
    const updateSearchView = (event: Event) => {
      setSearchListDominant(Boolean((event as CustomEvent<{ listDominant?: boolean }>).detail?.listDominant));
    };
    window.addEventListener("ccr:search-view-state", updateSearchView as EventListener);
    return () => window.removeEventListener("ccr:search-view-state", updateSearchView as EventListener);
  }, []);
  const nativeSearchServices = useMemo(
    () =>
      locale === "en"
        ? ["electrician", "plumber", "accountant", "mechanic", "photographer", "lawyer"]
        : ["electricista", "plomero", "contador", "mecánico", "fotógrafo", "abogado"],
    [locale],
  );
  const mobileSlidingService = useSlidingWords(
    nativeSearchServices,
    showMobileNavbarSearch && !nativeSearchOpen && !searchQuery.trim(),
  );
  const headerCategoryId = currentSearchParams.get("categoria");
  // Una FAMILIA entera ("Todos los servicios de Agro") también es contexto de
  // búsqueda: sin esto la barra se quedaba con su texto de ayuda —"¿Qué
  // servicio estás buscando?"— aunque la búsqueda ya estuviera hecha.
  const headerGroupId = currentSearchParams.get("grupo");
  const headerGroupLabel = headerGroupId && getAllCategoryGroups().some((group) => group.id === headerGroupId)
    ? getCategoryGroupLabel(headerGroupId, locale)
    : "";
  const explicitHeaderService =
    headerCategoryId && headerCategoryId !== "todas"
      ? getCategoryLabel(headerCategoryId, locale)
      : headerGroupLabel || currentSearchParams.get("q")?.trim() || "";
  const headerServiceLabel =
    explicitHeaderService || mobileSlidingService.current || nativeSearchServices[0] || (locale === "en" ? "electrician" : "electricista");
  const headerCantonId = currentSearchParams.get("canton");
  const headerProvinceId = currentSearchParams.get("provincia");
  const headerLocationSuggestion = headerCantonId
    ? allLocationSuggestions().find((location) => location.type === "canton" && location.id === headerCantonId) ?? null
    : headerProvinceId
      ? allLocationSuggestions().find((location) => location.type === "province" && location.id === headerProvinceId) ?? null
      : null;
  const explicitHeaderLocation = currentSearchParams.get("ubicacion")?.trim() ||
    (headerLocationSuggestion?.type === "canton"
      ? `${headerLocationSuggestion.label}, ${headerLocationSuggestion.sublabel}`
      : headerLocationSuggestion?.label ?? "");
  const headerLocationLabel = explicitHeaderLocation || "Costa Rica";
  const headerLatitude = Number(currentSearchParams.get("lat"));
  const headerLongitude = Number(currentSearchParams.get("lng"));
  const headerCoordinates = useMemo(
    () => Number.isFinite(headerLatitude) && Number.isFinite(headerLongitude)
      ? { latitude: headerLatitude, longitude: headerLongitude }
      : null,
    [headerLatitude, headerLongitude],
  );
  const searchRouteHasContext = pathname === "/buscar" && Boolean(explicitHeaderService || explicitHeaderLocation);
  const headerNextServiceLabel = mobileSlidingService.next || headerServiceLabel;
  const headerServiceShouldSlide = !explicitHeaderService && showMobileNavbarSearch && !nativeSearchOpen && !searchQuery.trim() && nativeSearchServices.length > 1;
  const hasSearchService = searchQuery.trim().length > 0 || !!searchCategoryId;
  const hasSearchLocation = navLocation.trim().length > 0 || !!navLocationSel || !!navCurrentCoords;

  useEffect(() => {
    if (pathname !== "/buscar") return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setSearchQuery(headerGroupLabel ? "" : explicitHeaderService);
      setSearchCategoryId(headerCategoryId && headerCategoryId !== "todas" ? headerCategoryId : null);
      setNavLocation(explicitHeaderLocation);
      setNavLocationSel(headerLocationSuggestion);
      setNavCurrentCoords(headerCoordinates);
    });
    return () => { active = false; };
  }, [explicitHeaderLocation, explicitHeaderService, headerCategoryId, headerGroupLabel, headerCoordinates, headerLocationSuggestion, pathname]);

  useEffect(() => {
    queueMicrotask(() => setHydrated(true));
  }, []);

  useEffect(() => {
    let active = true;
    let frame: number | null = null;
    try {
      const raw = window.localStorage.getItem(CURRENT_LOCATION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { latitude?: number; longitude?: number } | null;
      if (typeof parsed?.latitude !== "number" || typeof parsed?.longitude !== "number") return;
      const coords = { latitude: parsed.latitude, longitude: parsed.longitude };
      frame = window.requestAnimationFrame(() => {
        if (active) setCurrentLocationSuggestions(nearbyLocationSuggestions(coords));
      });
      void currentLocationSuggestionsFromCoords(coords).then((suggestions) => {
        if (active && suggestions.length > 0) setCurrentLocationSuggestions(suggestions);
      });
    } catch {
      window.localStorage.removeItem(CURRENT_LOCATION_STORAGE_KEY);
    }
    return () => {
      active = false;
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const roots = [document.documentElement, document.body];
    const updateHeaderHeight = () => {
      const mobile = window.matchMedia("(max-width: 1023px)").matches;
      root.style.setProperty("--ccr-native-header-height", mobile && showMobileNavbarSearch ? "124px" : "64px");
      roots.forEach((item) => item.classList.toggle("ccr-mobile-navbar-search-visible", mobile && showMobileNavbarSearch));
    };
    updateHeaderHeight();
    window.addEventListener("resize", updateHeaderHeight);
    window.visualViewport?.addEventListener("resize", updateHeaderHeight);
    return () => {
      window.removeEventListener("resize", updateHeaderHeight);
      window.visualViewport?.removeEventListener("resize", updateHeaderHeight);
      root.style.removeProperty("--ccr-native-header-height");
      roots.forEach((item) => item.classList.remove("ccr-mobile-navbar-search-visible"));
    };
  }, [showMobileNavbarSearch]);

  // "Ingresar" routes to the robust /login PAGE (forgot-password, role-aware
  // post-login redirect to the correct panel, waitForAuthCookie, OAuth `next`,
  // social-only detection). NO `redirect` param: the navbar only sits on PUBLIC
  // pages and login must land on the user's DASHBOARD - a generic public redirect
  // would OVERRIDE the role-based panel redirect (the "login lands on the main page"
  // bug). Meaningful deep-links (support tickets, gated pages) carry their OWN
  // ?redirect= via the proxy and are still honored by /login.
  const loginHref = "/login";

  // `isPro` = the account can OFFER services (Airbnb "host" capability). Auth
  // metadata is the fast path; the canonical professional row repairs stale
  // metadata so an existing provider never sees the registration CTA again.
  const hasResolvedAccountCapability = !!user && accountCapability?.userId === user.id;
  const isPro = canOffer(user) || (hasResolvedAccountCapability && accountCapability.hasProfessionalProfile);
  const isAdminUser = user?.user_metadata?.role === "admin" || (hasResolvedAccountCapability && accountCapability.role === "admin");
  // Solo a una cuenta de cliente confirmada: mientras no se sepa si ofrece
  // servicios no se ofrece nada, para no parpadear con el enlace puesto y
  // quitado en cada carga.
  const mostrarOfrecerServicios = !!user && hasResolvedAccountCapability && !isPro;
  const { mode } = useMode(isPro);

  // ONE unified panel ("Mi panel") for every account; it opens in the right mode
  // by itself. The "Usar servicios" sections live under their own tabs there.
  const panelHref = "/dashboard/profesional";
  const professionalPanelHref = `${panelHref}?mode=offer`;
  const clientPanelHref = `${panelHref}?mode=use`;
  const primaryPanelHref = isPro ? (mode === "offer" ? professionalPanelHref : clientPanelHref) : clientPanelHref;
  const projectsHref = "/dashboard/profesional?tab=sent_projects";
  const savedHref = "/dashboard/profesional?tab=saved";
  const profilePanelHref = `${panelHref}?mode=${isPro && mode === "offer" ? "offer" : "use"}&tab=profile`;
  // El nombre del negocio vive en otra tabla, así que pedirlo desde el navegador
  // hacía pintar el nombre de la persona y cambiarlo medio segundo después. Ahora
  // el servidor lo entrega con la página (`accountName`) y la barra se pinta una
  // sola vez; lo que llega después solo corrige si de verdad cambió.
  const accountDisplayName =
    (hasResolvedAccountCapability ? accountCapability.businessName : (accountName ?? "")) ||
    String(user?.user_metadata?.full_name || user?.user_metadata?.name || "").trim();
  const nativePanelHref = user ? primaryPanelHref : loginHref;
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      queueMicrotask(() => setAccountCapability(null));
      return;
    }

    const loadAccountCapability = async () => {
      try {
        const supabase = createClient();
        const [profileResult, professionalResult] = await Promise.all([
          supabase.rpc("get_my_profile"),
          supabase.from("professionals").select("id,business_name").eq("profile_id", user.id).maybeSingle(),
        ]);
        if (!cancelled) {
          const businessName = String(professionalResult.data?.business_name || "").trim();
          setAccountCapability({
            userId: user.id,
            role: (profileResult.data as { role?: string } | null)?.role ?? null,
            hasProfessionalProfile: !!professionalResult.data,
            capabilityKnown: !professionalResult.error,
            businessName,
          });
        }
      } catch {
        if (!cancelled) {
          setAccountCapability({
            userId: user.id,
            role: null,
            hasProfessionalProfile: false,
            capabilityKnown: false,
            businessName: "",
          });
        }
      }
    };
    void loadAccountCapability();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Warm the two most common destinations after the current page settles. This
  // keeps the initial render light while making the first panel/search transition
  // use Next's prefetched route payload instead of waiting after the click.
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      router.prefetch("/buscar");
      if (user && !pathname.startsWith("/dashboard/profesional")) {
        router.prefetch(primaryPanelHref);
        prefetchDashboardBootstrap(user.id);
      }
    }, nativeApp ? 0 : 120);
    return () => window.clearTimeout(timeout);
  }, [nativeApp, pathname, primaryPanelHref, router, user]);

  useEffect(() => {
    if (!nativeApp) return;
    router.prefetch("/buscar");
  }, [nativeApp, router]);

  useEffect(() => {
    if (!nativeApp || !user) return;
    router.prefetch("/mensajes");
    router.prefetch(primaryPanelHref);
    prefetchDashboardBootstrap(user.id);
    void prefetchConversations();
  }, [nativeApp, primaryPanelHref, router, user]);

  const visibleResourceLinks = useMemo(() => RESOURCES_LINKS, []);
  // El cajón no marca dónde estás: ya lo sabes, y en turquesa se leía como
  // "seleccionado", que es otra cosa. Todos sus enlaces se ven igual.
  const claseCajon = (_href: string) => mobileDrawerItemClass;

  const irAlInicio = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!nativeApp) return;
    event.preventDefault();
    event.stopPropagation();
    // Con el asistente encima, el logo primero lo aparta — si la ruta de abajo
    // ya era la portada, sin esto el toque "no hacía nada".
    window.dispatchEvent(new Event("contratacr:close-ai"));
    const destino = `/${locale}`;
    if (window.location.pathname === destino) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // Nunca location.assign como respaldo: una recarga completa del documento
    // vuelve a pintar la marca de arranque, que dentro de la app no va jamás.
    // Si la navegación tarda, la pantalla anterior sigue visible hasta llegar.
    router.push("/");
  }, [locale, nativeApp, router]);

  const mobileDrawerItemClass =
    "flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left text-[16px] font-semibold leading-snug text-[#162543] transition-colors hover:bg-[#f4f7fa] hover:text-[#009FD9]";
  const mobileDrawerTextClass = "min-w-0 flex-1 whitespace-normal break-words";
  const mobileDrawerStrongItemClass = cn(mobileDrawerItemClass, "font-extrabold");
  const mobileDrawerSubItemClass =
    "flex w-full items-center gap-2.5 rounded-xl px-2 py-2.5 text-left text-[14px] font-semibold leading-snug text-[#374151] transition-colors hover:bg-[#f4f7fa] hover:text-[#009FD9]";

  // Una sola barra superior: si la pantalla actual publica un título de sección
  // ("ccr:section-header"), la barra muestra "← Título" en lugar del logo y
  // confirma con "ccr:section-header-ack" para que la pantalla oculte la suya.
  const [sectionTitle, setSectionTitle] = useState<string | null>(null);
  const [sectionActive, setSectionActive] = useState(false);
  // El buscador del home entra en una SEGUNDA LÍNEA bajo la barra, igual que en
  // /buscar. No toca --ccr-native-header-height a propósito: si el hueco
  // reservado creciera a mitad del scroll, la página daría un salto de 60 px.
  const buscadorHomeMovil = buscadorHomeMovilBase && !sectionActive;
  const segundaLineaBuscador = showMobileNavbarSearch || buscadorHomeMovil;
  const [sectionRoot, setSectionRoot] = useState(false);
  const [sectionShare, setSectionShare] = useState(false);
  const [sectionMenu, setSectionMenu] = useState(false);
  useEffect(() => {
    // La pantalla puede haber publicado su título antes de que esta barra
    // montara, así que se lee también el valor global.
    const global = window as unknown as {
      __ccrSectionHeader?: string | null;
      __ccrSectionActive?: boolean;
      __ccrSectionRoot?: boolean;
      __ccrSectionShare?: boolean;
      __ccrSectionMenu?: boolean;
    };
    const inicial = global.__ccrSectionHeader ?? null;
    if (inicial || global.__ccrSectionActive) {
      setSectionTitle(inicial);
      setSectionActive(true);
      setSectionRoot(!!global.__ccrSectionRoot);
      setSectionShare(!!global.__ccrSectionShare);
      setSectionMenu(!!global.__ccrSectionMenu);
      window.dispatchEvent(new Event("ccr:section-header-ack"));
    }
    const onHeader = (event: Event) => {
      const detail = (event as CustomEvent<{ title?: string | null; share?: boolean; root?: boolean; menu?: boolean } | null>).detail;
      const title = detail?.title ?? null;
      setSectionTitle(title);
      setSectionActive(detail !== null);
      setSectionRoot(!!detail?.root);
      setSectionShare(!!detail?.share);
      setSectionMenu(!!detail?.menu);
      if (detail !== null) window.dispatchEvent(new Event("ccr:section-header-ack"));
    };
    const onMenuVisible = (event: Event) => {
      const detail = (event as CustomEvent<{ visible?: boolean }>).detail;
      setSectionMenu(!!detail?.visible);
    };
    window.addEventListener("ccr:section-menu-visible", onMenuVisible as EventListener);
    window.addEventListener("ccr:section-header", onHeader as EventListener);
    return () => {
      window.removeEventListener("ccr:section-menu-visible", onMenuVisible as EventListener);
      window.removeEventListener("ccr:section-header", onHeader as EventListener);
    };
  }, []);

  const openMobileMenu = useCallback(() => {
    setMobileHelpOpen(false);
    setMobileOpen(true);
  }, []);

  useEffect(() => {
    const handleExternalMenuOpen = () => openMobileMenu();
    window.addEventListener("ccr:open-mobile-menu", handleExternalMenuOpen);
    return () => window.removeEventListener("ccr:open-mobile-menu", handleExternalMenuOpen);
  }, [openMobileMenu]);

  const isNativeTabActive = useCallback(
    (href: string) => {
      const baseHref = href.split("?")[0] ?? href;
      if (nativePendingHref) return nativePendingHref === href;
      return pathname === baseHref || (baseHref === panelHref && pathname.startsWith(panelHref));
    },
    [nativePendingHref, panelHref, pathname],
  );

  const prepareNativeNavigation = useCallback(
    (href: string) => {
      if (nativePendingTimer.current) window.clearTimeout(nativePendingTimer.current);
      setNativePendingHref(href);
      router.prefetch(href);
      nativePendingTimer.current = window.setTimeout(() => setNativePendingHref(null), 8000);
    },
    [nativeApp, router],
  );

  const navigateNativeMarketplace = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, href: "/ofertas" | "/empleos") => {
      if (!nativeApp) return;
      // Same-document navigation, like every other tab. The old full reload
      // cost a blank frame plus re-running all scripts on each tap; if the RSC
      // payload ever fails, the route error boundary still offers a retry.
      event.preventDefault();
      event.stopPropagation();
      setMobileOpen(false);
      prepareNativeNavigation(href);
      router.push(href);
    },
    [nativeApp, prepareNativeNavigation, router],
  );

  useEffect(() => {
    const clearAssistant = () => setNativePendingHref((current) => (current === "assistant" ? null : current));
    window.addEventListener("contratacr:close-ai", clearAssistant);
    return () => window.removeEventListener("contratacr:close-ai", clearAssistant);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setNativePendingHref(null), 0);
    if (nativePendingTimer.current) {
      window.clearTimeout(nativePendingTimer.current);
      nativePendingTimer.current = null;
    }
    return () => window.clearTimeout(id);
  }, [pathname]);

  const compactSuggestions = matchCategories(searchQuery, 8, locale);
  const showNativeServiceSuggestions =
    nativeSearchOpen && searchFocused && searchQuery.trim().length >= 2 && compactSuggestions.length > 0;
  const navLocSug = useMemo(() => searchLocations(navLocation), [navLocation]);
  const nativeLocationSuggestions = useMemo(() => {
    const typed = searchLocations(navLocation).filter((suggestion) => suggestion.type === "province" || suggestion.type === "canton");
    if (typed.length > 0) return typed;
    return currentLocationSuggestions?.length ? currentLocationSuggestions : provinceSuggestions();
  }, [currentLocationSuggestions, navLocation]);

  // Track small screens so the compact search placeholder can shorten to fit.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsSmallScreen(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Lock body scroll while the mobile drawer is open (no scrolling behind it).
  useEffect(() => {
    if (!mobileOpen) return;
    return lockBodyScroll();
  }, [mobileOpen]);

  useEffect(() => {
    return () => {
      if (nativePendingTimer.current) window.clearTimeout(nativePendingTimer.current);
    };
  }, []);

  async function handleSignOut() {
    // Go STRAIGHT home - `signOutToHome` flags the in-flight sign-out so protected
    // pages (dashboards, etc.) don't bounce the now-absent user to /login mid-logout.
    await signOutToHome(locale);
  }

  useEffect(() => {
    if (!compactEnabled) {
      const timeout = window.setTimeout(() => setCompact(false), 0);
      return () => window.clearTimeout(timeout);
    }
    if (!isHomePage) return;

    let frame: number | null = null;
    const update = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const sentinel = document.getElementById("hero-search-sentinel");
        // En la app el que se desplaza es <main> (el body queda fijo), así que
        // mirar solo window.scrollY dejaba el buscador fuera de la barra para
        // siempre. Se mide el desplazamiento venga de donde venga.
        const desplazamientoVentana = window.scrollY || document.scrollingElement?.scrollTop || 0;
        const desplazamientoContenedor = document.querySelector("main")?.scrollTop ?? 0;
        const desplazado = desplazamientoVentana > 0 || desplazamientoContenedor > 0;
        // The compact search appears only after the primary hero search has
        // crossed above the fixed 64px navbar. A scroll measurement is more
        // reliable than observing the zero-height sentinel across refreshes.
        setCompact(desplazado && (sentinel
          ? sentinel.getBoundingClientRect().top <= 64
          : Math.max(desplazamientoVentana, desplazamientoContenedor) > 300));
      });
    };

    update();
    // Con capture también llegan los scroll de <main>, que no burbujean.
    document.addEventListener("scroll", update, { passive: true, capture: true });
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [compactEnabled, isHomePage]);

  useEffect(() => {
    if (openMenu !== "categorias" && openMenu !== "explorar" && openMenu !== "recursos") return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (openMenu === "categorias" && servicesMenuRef.current?.contains(target)) return;
      if (openMenu === "explorar" && exploreMenuRef.current?.contains(target)) return;
      if (openMenu === "recursos" && resourcesMenuRef.current?.contains(target)) return;
      setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openMenu]);


  // Build params from current state and navigate. Runs ONLY on Buscar/Enter.
  function runCompactSearch(
    overrides: {
      location?: LocationSuggestion | null;
      coords?: { latitude: number; longitude: number };
      locationLabel?: string;
    } = {},
  ) {
    const params = new URLSearchParams();
    const svc = repairVisibleText(searchQuery).trim();
    const picked = compactSuggestions.find((c) => c.id === searchCategoryId);
    if (searchCategoryId && picked && normalizeText(repairVisibleText(picked.label)) === normalizeText(svc)) {
      params.set("categoria", searchCategoryId);
    } else if (svc) {
      const inferred = resolveCategoryIntent(svc, locale);
      if (inferred) params.set("categoria", inferred.id);
      else params.set("q", svc);
    }
    const currentLocationLabel = locale === "en" ? "Current location" : "Ubicación actual";
    const activeCurrentCoords =
      overrides.coords ??
      (navCurrentCoords && normalizeText(navLocation) === normalizeText(currentLocationLabel) ? navCurrentCoords : null);
    const loc = activeCurrentCoords
      ? null
      : "location" in overrides
        ? overrides.location
        : navLocationSel && navLocationSel.label === navLocation
          ? navLocationSel
          : resolveLocation(navLocation);
    if (loc) {
      if (loc.type === "province") params.set("provincia", loc.id);
      else {
        params.set("provincia", loc.provinceId);
        params.set("canton", loc.id);
      }
    }
    if (activeCurrentCoords) {
      params.set("lat", activeCurrentCoords.latitude.toFixed(5));
      params.set("lng", activeCurrentCoords.longitude.toFixed(5));
      params.set("ubicacion", overrides.locationLabel ?? currentLocationLabel);
    }
    setSearchFocused(false);
    setNavLocOpen(false);
    if (svc) {
      guardarBusquedaReciente(svc);
      setBusquedasRecientes(leerBusquedasRecientesConFecha());
    }
    trackMetaEvent("Search", {
      content_type: "professional_service",
      search_string: params.get("categoria") ? "category" : params.get("q") ? "text" : "general",
      has_location: params.has("provincia") || params.has("canton") || params.has("lat") || params.has("lng"),
      source: "navbar",
    });
    router.push(`/buscar?${params.toString()}`);
  }

  function handleCompactSearch(e: React.FormEvent) {
    e.preventDefault();
    runCompactSearch();
  }

  function openNativeSearch() {
    // iOS solo levanta el teclado si el foco ocurre DENTRO del mismo toque. El
    // campo real todavía no existe al pulsar (el panel se monta después), así
    // que el foco salta primero a este campo puente —invisible y de un píxel— y
    // de ahí al buscador en cuanto aparece: el teclado ya viene subiendo y
    // cambiar de campo no lo baja. Con el foco diferido a 80 ms, el sistema lo
    // descartaba por venir fuera del gesto y había que tocar otra vez.
    try {
      puenteTecladoRef.current?.focus({ preventScroll: true });
    } catch {
      /* navegador sin preventScroll: el puente es un extra, no un requisito */
    }
    setNativeSearchOpen(true);
    setSearchFocused(true);
  }

  function closeNativeSearch() {
    soltarFoco();
    setNativeSearchOpen(false);
    setSearchFocused(false);
    setNavLocOpen(false);
  }

  function searchCurrentLocation() {
      const label = locale === "en" ? "Current location" : "Ubicación actual";
    if (!navigator.geolocation) {
      const fallback = resolveLocation("Costa Rica");
      setNavLocation(fallback?.label ?? "Costa Rica");
      setNavLocationSel(fallback);
      setNavCurrentCoords(null);
      setNavLocOpen(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const currentCoords = { latitude: coords.latitude, longitude: coords.longitude };
        const nearby = nearbyLocationSuggestions(currentCoords);
        setCurrentLocationSuggestions(nearby);
        try {
          window.localStorage.setItem(CURRENT_LOCATION_STORAGE_KEY, JSON.stringify(currentCoords));
        } catch {
          // Ignore storage failures; search still works for this session.
        }
        void currentLocationSuggestionsFromCoords(currentCoords).then((suggestions) => {
          if (suggestions.length > 0) setCurrentLocationSuggestions(suggestions);
        });
        setNavLocation(label);
        setNavLocationSel(null);
        setNavCurrentCoords(currentCoords);
        setNavLocOpen(false);
        if (!nativeSearchOpen) {
          window.setTimeout(() => runCompactSearch({ coords: currentCoords, locationLabel: label }), 0);
          return;
        }
        if (nativeSearchOpen && hasSearchService) {
          closeNativeSearch();
          window.setTimeout(() => runCompactSearch({ coords: currentCoords, locationLabel: label }), 0);
          return;
        }
        nativeSearchInputRef.current?.focus();
      },
      () => {
        const fallback = resolveLocation("Costa Rica");
        setNavLocation(fallback?.label ?? "Costa Rica");
        setNavLocationSel(fallback);
        setNavCurrentCoords(null);
        setNavLocOpen(false);
      },
      { enableHighAccuracy: true, maximumAge: 300000, timeout: 10000 },
    );
  }

  useEffect(() => {
    const open = () => openNativeSearch();
    window.addEventListener("ccr:open-native-search", open);
    return () => window.removeEventListener("ccr:open-native-search", open);
  }, []);

  useEffect(() => {
    if (!nativeSearchOpen) return;
    setBusquedasRecientes(leerBusquedasRecientesConFecha());
    setVisitasRecientes(readRecentVisits("profesionales"));
  }, [nativeSearchOpen]);

  // Al abrir el buscador, el cursor entra en el primer campo (Servicio). Se
  // intenta tres veces —al montar, en el siguiente cuadro y un pelo después—
  // porque el panel entra animado y el primer intento puede caer antes de que
  // el campo esté en pantalla.
  useEffect(() => {
    if (!nativeSearchOpen) return;
    const enfocar = () => nativeSearchInputRef.current?.focus({ preventScroll: true });
    enfocar();
    const cuadro = window.requestAnimationFrame(enfocar);
    const tarde = window.setTimeout(enfocar, 140);
    return () => {
      window.cancelAnimationFrame(cuadro);
      window.clearTimeout(tarde);
    };
  }, [nativeSearchOpen]);

  useEffect(() => {
    if (!nativeSearchOpen) return;
    const roots = [document.documentElement, document.body];
    roots.forEach((root) => root.classList.add("ccr-native-search-overlay-open"));
    const unlock = lockBodyScroll();
    return () => {
      unlock();
      roots.forEach((root) => root.classList.remove("ccr-native-search-overlay-open"));
    };
  }, [nativeSearchOpen]);

  // Selecting a suggestion FILLS the field - it does NOT search immediately.
  function selectCompactSuggestion(id: string) {
    const picked = compactSuggestions.find((c) => c.id === id);
    if (picked) {
      setSearchQuery(repairVisibleText(picked.label));
      setSearchCategoryId(id);
    }
    setSearchActiveIdx(-1);
    setSearchFocused(false);
  }

  function selectNativeCompactSuggestion(id: string) {
    const picked = compactSuggestions.find((c) => c.id === id);
    if (picked) {
      setSearchQuery(repairVisibleText(picked.label));
      setSearchCategoryId(id);
    }
    setSearchActiveIdx(-1);
    setSearchFocused(false);
    // La regla es sobre lo que la persona ve: si el campo de ubicación está
    // vacío se pasa a él, aunque queden coordenadas de una búsqueda anterior.
    const ubicacionEscrita = navLocation.trim().length > 0 || !!navLocationSel;
    if (ubicacionEscrita) {
      closeNativeSearch();
      window.setTimeout(() => runCompactSearch(), 0);
      return;
    }
    window.setTimeout(() => {
      nativeLocationInputRef.current?.focus();
      setNavLocOpen(navLocation.trim().length >= 2);
    }, 50);
  }

  function selectNavLocation(s: LocationSuggestion) {
    setNavLocation(repairVisibleText(s.label));
    setNavLocationSel(s);
    setNavCurrentCoords(null);
    setNavLocOpen(false);
    setNavLocActive(-1);
    if (nativeSearchOpen && hasSearchService) {
      closeNativeSearch();
      window.setTimeout(() => runCompactSearch({ location: s }), 0);
    }
  }

  function handleCompactSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (searchFocused && compactSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSearchActiveIdx((i) => Math.min(i + 1, compactSuggestions.length - 1));
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSearchActiveIdx((i) => Math.max(i - 1, 0));
        return;
      } else if (e.key === "Enter" && searchActiveIdx >= 0) {
        e.preventDefault();
        if (nativeSearchOpen) selectNativeCompactSuggestion(compactSuggestions[searchActiveIdx].id);
        else selectCompactSuggestion(compactSuggestions[searchActiveIdx].id);
        return;
      } else if (e.key === "Escape") {
        setSearchFocused(false);
        return;
      }
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // Falta la ubicación: se salta a ella en vez de buscar a medias (antes
      // esto solo ocurría dentro de la app).
      if (searchQuery.trim() && !navLocation.trim()) {
        // El salto a la ubicación no pierde lo buscado: queda en recientes ya.
        guardarBusquedaReciente(searchQuery.trim());
        setBusquedasRecientes(leerBusquedasRecientesConFecha());
        (nativeSearchOpen ? nativeLocationInputRef.current : navLocationInputRef.current)?.focus();
        setNavLocOpen(false);
        return;
      }
      if (nativeSearchOpen) closeNativeSearch();
      runCompactSearch();
    }
  }

  function handleNavLocKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (navLocOpen && navLocSug.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setNavLocActive((i) => Math.min(i + 1, navLocSug.length - 1));
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setNavLocActive((i) => Math.max(i - 1, 0));
        return;
      } else if (e.key === "Enter" && navLocActive >= 0) {
        e.preventDefault();
        selectNavLocation(navLocSug[navLocActive]);
        return;
      } else if (e.key === "Escape") {
        setNavLocOpen(false);
        return;
      }
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (nativeSearchOpen) closeNativeSearch();
      runCompactSearch();
    }
  }

  return (
    <>
      {headerHeightStyle && <style id="ccr-header-height-style" dangerouslySetInnerHTML={{ __html: headerHeightStyle }} />}
      <>
        <header
          data-testid="landing-navbar"
          data-hydrated={hydrated ? "true" : "false"}
          data-compact-search={effectiveCompact ? "visible" : "hidden"}
          className={cn(
            "ccr-app-header fixed top-0 left-0 right-0 z-50 border-b bg-white/96 backdrop-blur-md",
            // La barra se separa del contenido con una línea, no con sombra: en
            // escritorio la sombra proyectada ensuciaba el borde del contenido.
            // En la app la línea aparece solo al desplazar.
            rutaConFiltrosPegados
              // En la app la barra se funde con los filtros; en computadora la
              // línea va siempre, o el encabezado y los filtros se leían como
              // una sola mancha blanca.
              ? (nativeHeaderShell ? "border-transparent shadow-none" : "border-[#e3ebf2] shadow-none")
              : nativeHeaderShell
                // En la app también manda la línea: la sombra proyectada bajo el
                // encabezado se veía como una mancha gris sobre el contenido.
                ? cn("transition-[border-color] duration-200 shadow-none", contenidoDebajo || lienzoBlanco
                    ? "border-gray-100/80"
                    : "border-transparent")
                : "border-[#e3ebf2] shadow-none",
            drawerOnly && "hidden",
          )}
        >
          <div className="px-4 sm:px-6 lg:px-8">
            <div className={cn(
              "relative h-16 transition-[height] duration-200",
              segundaLineaBuscador && "h-[124px] lg:h-16",
            )}>
              <div className={cn(
                "absolute left-0 right-0 top-0 flex h-16 items-center lg:hidden",
                nativeHeaderShell
                  ? "justify-start gap-1.5"
                  : "justify-start gap-2",
              )}>
                {sectionActive && sectionRoot ? (
                  <>
                    <button
                      type="button"
                      onClick={openMobileMenu}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#162543] transition-colors hover:bg-gray-50"
                      aria-label={t("openMenu")}
                    >
                      <Menu className="h-5 w-5 stroke-[2.5]" />
                    </button>
                    <Link href="/" aria-label="ContrataCR inicio" onClick={irAlInicio} className="-ml-1 shrink-0">
                      <ContrataCRMark className="h-7 w-7" />
                    </Link>
                    {/* <p>, no <h1>: la página ya tiene su único h1 (el nombre del
                        profesional, el título de la sección…). Este rótulo es de la
                        barra, y como h1 quedaba un h1 oculto por delante del real. */}
                    <p data-ccr-section-title="" className="mr-auto min-w-0 truncate pl-1.5 text-[17px] font-extrabold text-[#162543]">{sectionTitle}</p>
                  </>
                ) : sectionActive ? (
                  <>
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new Event("ccr:section-back"))}
                      data-ccr-section-back=""
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#162543] transition-colors hover:bg-gray-50"
                      aria-label={t("back")}
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </button>
                    <p data-ccr-section-title="" className="mr-auto min-w-0 truncate pr-2 text-[17px] font-extrabold text-[#162543]">{sectionTitle}</p>
                    {!sectionTitle && <span className="mr-auto" aria-hidden />}
                  </>
                ) : (
                  <>
                <button
                  type="button"
                  onClick={openMobileMenu}
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#162543] transition-colors hover:bg-gray-50",
                  )}
                  aria-label={t("openMenu")}
                >
                  <Menu className="h-5 w-5 stroke-[2.5]" />
                </button>

                <Link href="/" aria-label="ContrataCR inicio" onClick={irAlInicio} className={cn("shrink-0", nativeHeaderShell && "mr-auto flex min-w-0 items-center justify-start")}>
                  {mobileInline ? <ContrataCRMark className="h-8 w-8" /> : <ContrataCRLogo size="lg" />}
                </Link>
                  </>
                )}

                {!nativeHeaderShell && mobileInline && (
                  <div className="flex min-w-0 flex-1 items-center gap-2">{mobileInline}</div>
                )}

                {nativeHeaderShell ? (
                  !nativeFullscreenRoute ? (
                    <div className="flex h-10 shrink-0 items-center justify-end gap-1">
                      {!enMensajes && (
                        <HeaderMessagesLink
                          unreadCount={user ? nativeMessageUnread : 0}
                          label={locale === "en" ? "Messages" : "Mensajes"}
                          href={user ? "/mensajes" : accesoHref("/mensajes")}
                        />
                      )}
                      {!enNotificaciones &&
                        (user ? (
                          <NotificationBell scope="all" />
                        ) : (
                          <HeaderNotificationsLink
                            href={accesoHref("/notificaciones")}
                            label={locale === "en" ? "Notifications" : "Notificaciones"}
                          />
                        ))}
                    </div>
                  ) : (
                    <span className="h-10 w-10 shrink-0" aria-hidden />
                  )
                ) : (
                <div className="ml-auto flex shrink-0 items-center gap-0.5">
                  {user && <NotificationBell scope="all" />}
                  {!user && !sectionShare && <span className="h-10 w-10" aria-hidden />}
                </div>
                )}
                {sectionMenu && (
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new Event("ccr:section-menu"))}
                    aria-label={locale === "en" ? "Options" : "Opciones"}
                    data-ccr-section-menu=""
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#f8fafc] text-[#162543] ring-1 ring-[#dbe5ee] transition-colors hover:bg-[#eef5f9]"
                  >
                    <MoreHorizontal className="h-[18px] w-[18px]" />
                  </button>
                )}
                {sectionShare && (
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new Event("ccr:section-share"))}
                    aria-label={locale === "en" ? "Share" : "Compartir"}
                    data-ccr-section-share=""
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#162543] transition-colors hover:bg-gray-50"
                  >
                    <Share2 className="h-5 w-5" />
                  </button>
                )}
              </div>

              {/* -- Default row -- */}
              {segundaLineaBuscador && (
                <div
                  className="absolute -left-4 -right-4 top-16 z-10 flex h-[56px] items-start px-4 text-left lg:hidden"
                >
                  <div className="flex h-12 w-full items-center gap-3 rounded-[10px] border border-[#e3ebf2] bg-white px-3 transition-colors focus-within:border-[#009FD9]">
                    <button
                      type="button"
                      onClick={openNativeSearch}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      aria-label={locale === "en" ? "What service are you looking for?" : "¿Qué servicio estás buscando?"}
                    >
                      <Search className="h-5 w-5 shrink-0 text-[#162543]" />
                      {searchRouteHasContext ? (
                        <span data-testid="search-context-summary" className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden whitespace-nowrap text-[15px]">
                          <span className="truncate font-extrabold text-[#162543]">
                            {explicitHeaderService || (locale === "en" ? "Professionals" : "Profesionales")}
                          </span>
                          <span className="truncate font-medium text-[#8f9aaa]">{headerLocationLabel}</span>
                        </span>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#8f9aaa]">
                          {locale === "en" ? "What service are you looking for?" : "¿Qué servicio estás buscando?"}
                        </span>
                      )}
                    </button>
                    {showSearchViewToggle && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          window.dispatchEvent(new CustomEvent("ccr:set-search-view", { detail: { view: searchListDominant ? "map" : "list" } }));
                        }}
                        aria-label={searchListDominant
                          ? (locale === "en" ? "Show map" : "Mostrar mapa")
                          : (locale === "en" ? "Show results" : "Mostrar resultados")}
                        className="-mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#162543] transition hover:bg-[#eef6fa] active:scale-95"
                      >
                        {searchListDominant ? <MapIcon className="h-5 w-5" /> : <List className="h-5 w-5" />}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="relative hidden h-16 items-center gap-2 lg:flex xl:gap-3">
                <Link href="/" aria-label="ContrataCR inicio" onClick={irAlInicio} className="shrink-0">
                  {mobileInline ? (
                    <>
                      {/* Compact mark on mobile ONLY when the inline search is present (it needs the
                          row); the full logo + wordmark on desktop. */}
                      <ContrataCRMark className="h-8 w-8 lg:hidden" />
                      <span className="hidden lg:inline-flex"><ContrataCRLogo size="lg" /></span>
                    </>
                  ) : (
                    /* Mode switch left the navbar (sprint 518) -> there's room for the FULL logo +
                       "ContrataCR" wordmark on mobile again. */
                    <ContrataCRLogo size="lg" />
                  )}
                </Link>

                {/* MOBILE inline slot (search + filters) - only when provided, only <lg. */}
                {mobileInline && (
                  <div className="lg:hidden flex min-w-0 flex-1 items-center gap-2">{mobileInline}</div>
                )}

                <nav className={cn("relative z-[70] hidden shrink-0 lg:flex items-center gap-1", effectiveMarketplaceDesktop && "gap-0.5")}>
                {/* Categorias - mega-menu with autocomplete + curated columns */}
                  <div
                    ref={servicesMenuRef}
                    className="relative"
                  >
                    <button
                      type="button"
                      aria-expanded={openMenu === "categorias"}
                      onClick={() => setOpenMenu(openMenu === "categorias" ? null : "categorias")}
                      className={cn(
                        "relative flex items-center gap-1 rounded-xl py-2 text-sm font-medium transition-colors after:absolute after:-bottom-1 after:h-0.5 after:rounded-full after:bg-[#009FD9] after:transition-opacity",
                        effectiveMarketplaceDesktop ? "px-2.5 after:left-2.5 after:right-2.5" : "px-4 after:left-4 after:right-4",
                        "text-[#1A2744] after:opacity-0 hover:text-[#009FD9] hover:bg-gray-50"
                      )}
                    >
                      {t("categories")}
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", openMenu === "categorias" && "rotate-180")} />
                    </button>

                    {openMenu === "categorias" && (
                      <div
                        data-testid="services-mega-menu"
                        className="absolute top-full left-0 z-50 mt-1.5 flex max-h-[calc(100vh-5rem)] w-[840px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_24px_70px_-22px_rgba(15,23,42,0.45)]"
                        style={{ animation: "tab-cards-in 0.15s ease both" }}
                      >
                        {/* ONE container: typing in the search FILTERS the categories in place. */}
                        <CategoriesMegaPanel onNavigate={() => setOpenMenu(null)} />
                      </div>
                    )}
                  </div>

                  <div ref={exploreMenuRef} className="relative">
                    <button
                      type="button"
                      aria-expanded={openMenu === "explorar"}
                      onClick={() => setOpenMenu(openMenu === "explorar" ? null : "explorar")}
                      className={cn(
                        "relative flex items-center gap-1 rounded-xl py-2 text-sm font-medium transition-colors hover:bg-gray-50 hover:text-[#009FD9]",
                        effectiveMarketplaceDesktop ? "px-2.5" : "px-4",
                        openMenu === "explorar" ? "text-[#009FD9]" : "text-[#1A2744]",
                      )}
                    >
                      {locale === "en" ? "Explore" : "Explorar"}
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", openMenu === "explorar" && "rotate-180")} />
                    </button>
                    {openMenu === "explorar" && (
                      <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[220px] overflow-hidden rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_24px_70px_-22px_rgba(15,23,42,0.45)]">
                        {EMPLEOS_VISIBLE && (
                          <Link href="/empleos" onClick={() => setOpenMenu(null)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#1A2744] transition-colors hover:bg-gray-50 hover:text-[#009FD9]">
                            <Briefcase className="h-5 w-5 shrink-0" />
                            {locale === "en" ? "Jobs" : "Empleos"}
                          </Link>
                        )}
                        <Link href="/ofertas" onClick={() => setOpenMenu(null)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#1A2744] transition-colors hover:bg-gray-50 hover:text-[#009FD9]">
                          <OfferTagPercentIcon className="h-5 w-5" />
                          {locale === "en" ? "Deals" : "Ofertas"}
                        </Link>
                      </div>
                    )}
                  </div>

                </nav>

                {effectiveMarketplaceDesktop ? (
                  <div className="pointer-events-auto relative z-[75] mr-2 hidden h-11 min-w-[360px] flex-1 lg:block xl:mr-3 xl:min-w-[430px]">
                    <div id="ccr-marketplace-navbar-slot" className="h-full w-full" />
                  </div>
                ) : (
                  <>
                    {/* Desktop compact search lives in the navbar flow, so it never covers links/actions. */}
                    <div
                      className={cn(
                        "mr-3 hidden min-w-0 flex-1 items-center transition-opacity duration-200 lg:flex xl:mr-4",
                        !showDesktopCompactSearch && "invisible",
                      )}
                      aria-hidden={!showDesktopCompactSearch}
                      style={{ opacity: showDesktopCompactSearch ? 1 : 0, pointerEvents: showDesktopCompactSearch ? "auto" : "none" }}
                    >
                      <form onSubmit={handleCompactSearch} className="flex min-w-0 flex-1">
                        <div className="relative w-full">
                          <div className="flex h-11 w-full items-center overflow-hidden rounded-[10px] border border-[#e3ebf2] bg-white pl-3 transition-colors focus-within:border-[#009FD9] sm:pl-4">
                            <div ref={compactSvcRef} className="flex h-full min-w-0 flex-[3_1_0%] items-center gap-2 sm:gap-3">
                              <button
                                type="submit"
                                aria-label={t("search")}
                                title={t("search")}
                                className="hidden h-8 w-8 shrink-0 place-items-center rounded-full text-[#162543] transition-colors hover:bg-[#EBF5FB] hover:text-[#009FD9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/30 sm:grid"
                              >
                                <Search className="h-5 w-5" />
                              </button>
                              <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(repairVisibleText(e.target.value)); setSearchCategoryId(null); setSearchActiveIdx(-1); }}
                                enterKeyHint={searchQuery.trim() && !navLocation.trim() ? "next" : "search"}
                                onKeyDown={handleCompactSearchKeyDown}
                                onFocus={() => { if (searchBlurTimer.current) clearTimeout(searchBlurTimer.current); setSearchFocused(true); }}
                                onBlur={() => { searchBlurTimer.current = setTimeout(() => setSearchFocused(false), 150); }}
                                placeholder={locale === "en" ? "What service are you looking for?" : "¿Qué servicio estás buscando?"}
                                className="min-w-0 flex-1 bg-transparent text-[15px] text-[#162543] placeholder:text-[#8f9aaa] focus:outline-none"
                                role="combobox"
                                aria-label={locale === "en" ? "Service" : "Servicio"}
                                aria-expanded={searchFocused && searchQuery.trim().length > 0}
                                aria-autocomplete="list"
                                aria-controls="navbar-service-suggestions"
                              />
                            </div>
                            <div className="mx-2 my-3 hidden w-px shrink-0 self-stretch bg-[#dbe4ee] sm:block" />
                            <div ref={compactLocRef} className="hidden h-full min-w-0 flex-[2_1_0%] items-center gap-2 sm:flex">
                              <MapPin className="h-5 w-5 shrink-0 text-[#162543]" />
                              <input
                                type="text"
                                ref={navLocationInputRef}
                                enterKeyHint={navLocation.trim() && !searchQuery.trim() ? "next" : "search"}
                                value={navLocation}
                                onChange={(e) => {
                                  const value = repairVisibleText(e.target.value);
                                  setNavLocation(value);
                                  setNavLocationSel(null);
                                  setNavCurrentCoords(null);
                                  setNavLocOpen(value.trim().length >= 2);
                                  setNavLocActive(-1);
                                }}
                                onKeyDown={handleNavLocKeyDown}
                                onFocus={() => {
                                  if (navLocBlurTimer.current) clearTimeout(navLocBlurTimer.current);
                                  setNavLocOpen(navLocation.trim().length >= 2);
                                }}
                                onBlur={() => { navLocBlurTimer.current = setTimeout(() => setNavLocOpen(false), 150); }}
                                placeholder={t("location")}
                                className="flex-1 w-full text-base text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none min-w-0"
                                role="combobox"
                                aria-label={locale === "en" ? "Location" : "Ubicación"}
                                aria-expanded={navLocOpen && navLocation.trim().length >= 2}
                                aria-autocomplete="list"
                                aria-controls="navbar-location-suggestions"
                              />
                            </div>
                          </div>

                          {/* Service autocomplete - selecting FILLS the field; search
                              runs only on Buscar/Enter. */}
                          <AnchoredDropdown anchorRef={compactSvcRef} open={searchFocused && searchQuery.trim().length > 0} maxHeight={320} className="rounded-xl border-gray-100 shadow-2xl">
                            <div id="navbar-service-suggestions" role="listbox" className="py-1.5">
                              {compactSuggestions.length === 0 ? (
                                <button
                                  type="button"
                                  onMouseDown={(e) => { e.preventDefault(); runCompactSearch(); }}
                                  className="w-full text-left px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-50"
                                >
                                  {t("searchAll", { q: searchQuery.trim() })}
                                </button>
                              ) : (
                                compactSuggestions.map((s, i) => (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); selectCompactSuggestion(s.id); }}
                                    role="option"
                                    aria-selected={i === searchActiveIdx}
                                    className={cn(
                                      "w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors",
                                      i === searchActiveIdx ? "bg-[#EBF5FB]" : "hover:bg-[#EBF5FB]"
                                    )}
                                  >
                                    <span className="text-sm font-medium text-[#1a2744]">{getCategoryLabel(s.id, locale)}</span>
                                    <span className="text-[11px] text-gray-400 shrink-0">{getCategoryGroupLabel(s.groupId, locale)}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          </AnchoredDropdown>

                          {/* Location autocomplete (desktop) - selecting FILLS the field. */}
                          <AnchoredDropdown anchorRef={compactLocRef} open={navLocOpen && navLocation.trim().length >= 2} maxHeight={320} className="rounded-xl border-gray-100 shadow-2xl">
                            <div id="navbar-location-suggestions" role="listbox" className="py-1.5">
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  searchCurrentLocation();
                                }}
                                className="flex w-full items-center gap-2.5 whitespace-nowrap border-b border-[#eef2f6] px-3.5 py-3 text-left text-sm font-semibold text-[#009FD9] transition-colors hover:bg-[#EBF5FB]"
                              >
                                <MapPin className="h-4 w-4 shrink-0" />
                                <span>{locale === "en" ? "Search near me" : "Buscar cerca de mí"}</span>
                              </button>
                              {navLocSug.map((s, i) => (
                                <button
                                  key={`${s.type}-${s.id}`}
                                  type="button"
                                  onMouseDown={(e) => { e.preventDefault(); selectNavLocation(s); }}
                                  role="option"
                                  aria-selected={i === navLocActive}
                                  className={cn(
                                    "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                                    i === navLocActive ? "bg-[#EBF5FB]" : "hover:bg-[#EBF5FB]"
                                  )}
                                >
                                  <MapPin className="h-4 w-4 text-[#009FD9] shrink-0" />
                                  <span className="flex-1 min-w-0">
                                    <span className="block text-sm font-medium text-[#1a2744] truncate">{s.label}</span>
                                    {s.type === "canton" && <span className="block text-[11px] text-gray-400 truncate">{s.sublabel}</span>}
                                  </span>
                                  <span className="text-[10px] uppercase tracking-wide text-gray-300 shrink-0">{s.type === "province" ? t("province") : t("canton")}</span>
                                </button>
                              ))}
                            </div>
                          </AnchoredDropdown>
                        </div>
                      </form>

                    </div>
                  </>
                )}

                {/* Right actions */}
                <div className="relative z-[60] ml-auto hidden min-w-0 shrink-0 items-center justify-end gap-2 lg:flex">
                  {/* Sobre ContrataCR: visible con y sin sesión. */}
                  <div
                    ref={resourcesMenuRef}
                    className="relative"
                  >
                    <button
                      type="button"
                      aria-expanded={openMenu === "recursos"}
                      onClick={() => setOpenMenu(openMenu === "recursos" ? null : "recursos")}
                      className={cn(
                        "relative flex items-center gap-1 rounded-xl py-2 text-sm font-medium transition-colors after:absolute after:-bottom-1 after:h-0.5 after:rounded-full after:bg-[#009FD9] after:transition-opacity",
                        effectiveMarketplaceDesktop ? "px-2.5 after:left-2.5 after:right-2.5" : "px-4 after:left-4 after:right-4",
                        "text-[#1A2744] after:opacity-0 hover:text-[#009FD9] hover:bg-gray-50"
                      )}
                    >
                      {t("resources")}
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", openMenu === "recursos" && "rotate-180")} />
                    </button>
                    {openMenu === "recursos" && (
                      <div
                        className="absolute top-full right-0 mt-1.5 bg-white rounded-2xl shadow-[0_24px_70px_-22px_rgba(15,23,42,0.45)] border border-gray-100 p-3 z-50 min-w-[300px]"
                        style={{ animation: "tab-cards-in 0.15s ease both" }}
                      >
                        <ul className="space-y-1">
                          {visibleResourceLinks.map((link) => (
                            <li key={link.href}>
                              {link.key === "support" ? (
                                <SupportLink
                                  onNavigate={() => setOpenMenu(null)}
                                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#1A2744] transition-colors hover:bg-gray-50 hover:text-[#009FD9]"
                                >
                                  <ResourceIcon name={link.key} />
                                  {t(`resourceLinks.${link.key}`)}
                                </SupportLink>
                              ) : (
                                <Link
                                  href={link.href}
                                  onClick={() => setOpenMenu(null)}
                                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#1A2744] transition-colors hover:bg-gray-50 hover:text-[#009FD9]"
                                >
                                  <ResourceIcon name={link.key} />
                                  {t(`resourceLinks.${link.key}`)}
                                </Link>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  {authLoading && !user ? (
                    <div className="flex w-[250px] items-center justify-end gap-2" aria-hidden="true">
                      <div className="h-10 w-24 animate-pulse rounded-xl bg-[#eef2f6]" />
                      <div className="h-10 w-10 animate-pulse rounded-full bg-[#eef2f6]" />
                    </div>
                  ) : user ? (
                    <div className="flex w-auto min-w-0 items-center justify-end gap-2">
                      {/* Quien ya tiene cuenta de cliente y quiere ofrecer servicios
                          necesita una puerta: sin sesión el rol se elige en /registro
                          (por eso el enlace salió del navbar en a8c05f7a), pero con
                          sesión ese camino no sirve y la persona se quedaba sin
                          manera de pasarse a profesional desde su cuenta. Texto
                          turquesa, no botón: es una invitación, no la acción
                          principal de la barra. */}
                      {mostrarOfrecerServicios && !effectiveMarketplaceDesktop && (
                        <Link
                          href="/registro/profesional"
                          className="inline-flex items-center rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap text-[#009FD9] transition-colors hover:bg-[#EBF5FB]"
                        >
                          {t("offerServices")}
                        </Link>
                      )}

                      {nativeApp && nativeHeaderShell && (
                        <HeaderMessagesLink unreadCount={nativeMessageUnread} label={locale === "en" ? "Messages" : "Mensajes"} />
                      )}
                      <NotificationBell scope="all" />
                      <AccountMenu
                        isPro={isPro}
                        displayName={accountDisplayName}
                        professionalPanelHref={professionalPanelHref}
                        clientPanelHref={clientPanelHref}
                        profileHref={profilePanelHref}
                        projectsHref={projectsHref}
                        savedHref={savedHref}
                        onSignOut={() => void handleSignOut()}
                      />
                    </div>
                  ) : (
                    // Como Upwork o Airbnb: entrar y crear cuenta siempre a la vista,
                    // también en las propias pantallas de acceso.
                    <div className="flex w-auto items-center justify-end gap-2">
                      <Link
                        href={loginHref}
                        className="text-sm font-medium px-3 py-2 rounded-xl text-[#1A2744] hover:bg-gray-50 transition-colors"
                      >
                        {t("login")}
                      </Link>
                      <Link
                        href="/registro"
                        className="rounded-xl bg-[#009FD9] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0088bb]"
                      >
                        {t("register")}
                      </Link>
                    </div>
                  )}
                  {/* Discreet, quiet globe + code dropdown - visually subordinate to the
                      prominent MODE segmented control (never a competing toggle). */}
                  <LanguageMenu />
                </div>

                {/* Mobile toggle - opens the left drawer. */}
                <button
                  type="button"
                  onClick={openMobileMenu}
                  className="lg:hidden ml-auto grid h-10 w-10 place-items-center rounded-xl text-[#162543] hover:bg-gray-50 transition-colors"
                  aria-label={t("openMenu")}
                >
                  <Menu className="h-5 w-5 stroke-[2.5]" />
                </button>
              </div>



            </div>
          </div>
        </header>

        {/* Campo puente del teclado (ver openNativeSearch). Invisible, de un
            píxel y sin recibir toques: solo existe para que el foco ocurra
            dentro del gesto. */}
        <input
          ref={puenteTecladoRef}
          type="text"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none fixed left-0 top-0 h-px w-px border-0 bg-transparent p-0 opacity-0"
        />
        {nativeSearchOpen && (
          <div
            className="ccr-native-search-panel fixed left-0 right-0 top-0 z-[220] overflow-hidden bg-white px-4 pb-0 pt-[calc(env(safe-area-inset-top)+1rem)] lg:hidden"
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                closeNativeSearch();
                runCompactSearch();
              }}
              className="mx-auto flex h-full max-w-[560px] flex-col"
            >
              <div className="space-y-3">
                <div className="flex h-13 items-center rounded-xl border border-[#d8e4ec] bg-white px-3 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.7)]">
                  <button
                    type="button"
                    onClick={closeNativeSearch}
                    aria-label={t("back")}
                    className="grid h-10 w-10 shrink-0 place-items-center text-[#1A2744]"
                  >
                    <ChevronRight className="h-6 w-6 rotate-180" />
                  </button>
                  <input
                    ref={nativeSearchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(repairVisibleText(event.target.value));
                      setSearchCategoryId(null);
                      setSearchActiveIdx(-1);
                      setSearchFocused(true);
                    }}
                    onFocus={() => setSearchFocused(true)}
                    onKeyDown={handleCompactSearchKeyDown}
                    placeholder={locale === "en" ? "Service" : "Servicio"}
                    className="min-w-0 flex-1 bg-transparent px-2 text-[17px] font-semibold text-[#1A2744] placeholder:text-[#a5afbd] focus:outline-none"
                    aria-label={locale === "en" ? "Service" : "Servicio"}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-controls="native-service-suggestions"
                    aria-expanded={showNativeServiceSuggestions}
                  />
                </div>
                <div className="flex h-13 items-center rounded-xl border border-[#d8e4ec] bg-white px-3 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.7)]">
                  <MapPin className="ml-2 h-6 w-6 shrink-0 text-[#1A2744]" />
                  <input
                    ref={nativeLocationInputRef}
                    type="text"
                    value={navLocation}
                    onChange={(event) => {
                      const value = repairVisibleText(event.target.value);
                      setNavLocation(value);
                      setNavLocationSel(null);
                      setNavCurrentCoords(null);
                      setNavLocActive(-1);
                      setNavLocOpen(value.trim().length >= 2);
                      setSearchFocused(false);
                    }}
                    onFocus={() => {
                      setNavLocOpen(navLocation.trim().length >= 2);
                      setSearchFocused(false);
                    }}
                    onKeyDown={handleNavLocKeyDown}
                            placeholder={locale === "en" ? "Neighborhood, city or province" : "Barrio, cantón o provincia"}
                    className="min-w-0 flex-1 bg-transparent px-3 text-[17px] font-semibold text-[#1A2744] placeholder:text-[#a5afbd] focus:outline-none"
                            aria-label={locale === "en" ? "Location" : "Ubicación"}
                            role="combobox"
                            aria-autocomplete="list"
                            aria-controls="native-location-suggestions"
                            aria-expanded={!showNativeServiceSuggestions && navLocOpen && navLocation.trim().length >= 2}
                  />
                  {navLocation && (
                    <button
                      type="button"
                      onClick={() => {
                        setNavLocation("");
                        setNavLocationSel(null);
                        setNavCurrentCoords(null);
                        nativeLocationInputRef.current?.focus();
                      }}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eef2f6] text-[#8a97a8]"
                            aria-label={locale === "en" ? "Clear location" : "Limpiar ubicación"}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
                {showNativeServiceSuggestions ? (
                  <div id="native-service-suggestions" className="space-y-1" role="listbox" aria-label={locale === "en" ? "Suggested services" : "Servicios sugeridos"}>
                    <p className="px-2 pb-1 pt-1 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#7a8797]">
                      {locale === "en" ? "Suggested services" : "Servicios sugeridos"}
                    </p>
                    {compactSuggestions.map((suggestion, index) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        role="option"
                        aria-selected={index === searchActiveIdx}
                        onClick={() => selectNativeCompactSuggestion(suggestion.id)}
                        className={cn(
                          "flex w-full items-center gap-4 rounded-xl px-2 py-3 text-left active:bg-[#eef9fd]",
                          index === searchActiveIdx && "bg-[#eef9fd]",
                        )}
                      >
                        <Search className="h-5 w-5 shrink-0 text-[#009FD9]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[16px] font-bold text-[#1A2744]">
                            {getCategoryLabel(suggestion.id, locale)}
                          </span>
                          <span className="block truncate text-[12px] font-semibold text-[#6b7280]">
                            {getCategoryGroupLabel(suggestion.groupId, locale)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                <div id="native-location-suggestions" className="space-y-1" role="listbox" aria-label={locale === "en" ? "Suggested locations" : "Ubicaciones sugeridas"}>
                  {/* UNA sola lista de recientes: las búsquedas y los perfiles
                      abiertos, intercalados por fecha. Dos apartados («Recientes» y
                      «Vistos recientemente») partían la pantalla en dos y se veía mal. */}
                  {!searchQuery.trim() && (busquedasRecientes.length > 0 || visitasRecientes.length > 0) && (
                    <div className="mb-2 space-y-1 border-b border-[#eef2f6] pb-3">
                      <div className="flex items-center justify-between px-2 pb-1 pt-1">
                        <p className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#7a8797]">
                          {t("recent")}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            olvidarBusquedasRecientes();
                            clearRecentVisits("profesionales");
                            setBusquedasRecientes([]);
                            setVisitasRecientes([]);
                          }}
                          className="text-[12px] font-bold text-[#009FD9]"
                        >
                          {t("recentClear")}
                        </button>
                      </div>
                      {[
                        ...busquedasRecientes.map((busqueda) => ({ clave: `b:${busqueda.termino}`, at: busqueda.at, busqueda, visita: null as RecentVisit | null })),
                        ...visitasRecientes.map((visita) => ({ clave: `v:${visita.id}`, at: visita.at ?? 0, busqueda: null as BusquedaReciente | null, visita })),
                      ]
                        .sort((primero, segundo) => segundo.at - primero.at)
                        .slice(0, 8)
                        .map((reciente) => reciente.busqueda ? (
                          <div key={reciente.clave} className="flex w-full items-center rounded-xl active:bg-[#eef9fd]">
                            <button
                              type="button"
                              onClick={() => {
                                setSearchQuery(reciente.busqueda!.termino);
                                setSearchCategoryId(null);
                                window.setTimeout(() => runCompactSearch(), 0);
                              }}
                              className="flex min-w-0 flex-1 items-center gap-4 rounded-xl px-2 py-3 text-left"
                            >
                              <Clock className="h-5 w-5 shrink-0 text-[#8b95a5]" />
                              <span className="min-w-0 flex-1 truncate text-[16px] font-bold text-[#1A2744]">{reciente.busqueda.termino}</span>
                            </button>
                            <button
                              type="button"
                              aria-label={locale === "en" ? `Remove ${reciente.busqueda.termino}` : `Quitar ${reciente.busqueda.termino}`}
                              onClick={() => {
                                const termino = reciente.busqueda!.termino;
                                olvidarBusquedaReciente(termino);
                                setBusquedasRecientes((previas) => previas.filter((item) => item.termino !== termino));
                              }}
                              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[#8b95a5] active:bg-[#e3f2fa]"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div key={reciente.clave} className="flex w-full items-center rounded-xl active:bg-[#eef9fd]">
                            <Link
                              href={reciente.visita!.href}
                              onClick={closeNativeSearch}
                              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2.5 text-left"
                            >
                              {reciente.visita!.imagen ? (
                                // eslint-disable-next-line @next/next/no-img-element -- miniatura fija; el optimizador no actúa en Cloudflare
                                <img src={reciente.visita!.imagen} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                              ) : (
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-extrabold ccr-caja-icono-plana">
                                  {reciente.visita!.iniciales ?? reciente.visita!.titulo.slice(0, 2).toUpperCase()}
                                </span>
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[15px] font-bold text-[#1A2744]">{reciente.visita!.titulo}</span>
                                {reciente.visita!.subtitulo && (
                                  <span className="block truncate text-[12px] font-semibold text-[#6b7280]">{reciente.visita!.subtitulo}</span>
                                )}
                              </span>
                            </Link>
                            <button
                              type="button"
                              aria-label={locale === "en" ? `Remove ${reciente.visita!.titulo}` : `Quitar ${reciente.visita!.titulo}`}
                              onClick={() => {
                                const id = reciente.visita!.id;
                                removeRecentVisit("profesionales", id);
                                setVisitasRecientes((previas) => previas.filter((item) => item.id !== id));
                              }}
                              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[#8b95a5] active:bg-[#e3f2fa]"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={searchCurrentLocation}
                    className="flex w-full items-center gap-4 rounded-xl px-2 py-3 text-left text-[16px] font-bold text-[#009FD9] active:bg-[#eef9fd]"
                  >
                    <MapPin className="h-5 w-5 shrink-0" />
                        <span>{locale === "en" ? "Search near me" : "Buscar cerca de mí"}</span>
                  </button>
                  {nativeLocationSuggestions.slice(0, 7).map((suggestion) => (
                    <button
                      key={`${suggestion.type}-${suggestion.id}-${suggestion.label}`}
                      type="button"
                      role="option"
                      aria-selected={suggestion.id === navLocationSel?.id}
                      onClick={() => {
                        setNavLocation(repairVisibleText(suggestion.label));
                        setNavLocationSel(suggestion);
                        setNavCurrentCoords(null);
                        setNavLocOpen(false);
                        setNavLocActive(-1);
                        if (hasSearchService) {
                          closeNativeSearch();
                          window.setTimeout(() => runCompactSearch({ location: suggestion }), 0);
                          return;
                        }
                        nativeSearchInputRef.current?.focus();
                        setSearchFocused(true);
                      }}
                      className="flex w-full items-center gap-4 rounded-xl px-2 py-3 text-left text-[16px] font-bold text-[#1A2744] active:bg-[#f4f7fa]"
                    >
                      <MapPin className="h-6 w-6 text-[#1A2744]" />
                      <span>
                        {suggestion.label}
                        {suggestion.type === "canton" && <span className="block text-[12px] font-semibold text-[#6b7280]">{suggestion.sublabel}</span>}
                      </span>
                    </button>
                  ))}
                </div>
                )}
              </div>
            </form>
          </div>
        )}

        {/* Mobile menu - slide-in LEFT drawer + transparent outside click layer (OUTSIDE <header>: the
            header's backdrop-filter would otherwise become the containing block
            for these `fixed` elements, breaking full-viewport positioning). */}
          <div
            className={cn(
              "lg:hidden fixed inset-0 z-[10050] bg-transparent transition-opacity duration-300",
              mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("menu")}
            onTouchStart={(e) => { drawerTouchX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              if (drawerTouchX.current == null) return;
              // Swipe left to close.
              if (e.changedTouches[0].clientX - drawerTouchX.current < -55) setMobileOpen(false);
              drawerTouchX.current = null;
            }}
            className={cn(
              "lg:hidden fixed top-0 left-0 bottom-0 z-[10060] w-[76vw] max-w-[320px] bg-white shadow-[18px_0_46px_-24px_rgba(15,23,42,0.65)] flex flex-col transition-[transform,visibility] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform",
              mobileOpen ? "visible translate-x-0 pointer-events-auto" : "invisible -translate-x-full pointer-events-none"
            )}
          >
            <div className="ccr-mobile-drawer-scroll flex flex-1 flex-col overflow-y-auto bg-white px-5 pb-7 pt-[calc(env(safe-area-inset-top)+28px)]">
              <nav className="flex flex-col gap-1">
                {user ? (
                  <>
                    {!nativeHeaderShell && (
                      <Link href={primaryPanelHref} onClick={() => setMobileOpen(false)} className={mobileDrawerStrongItemClass}>
                        <DrawerIcon><UserRound /></DrawerIcon>
                        <span className={mobileDrawerTextClass}>{locale === "en" ? "My dashboard" : "Mi panel"}</span>
                      </Link>
                    )}
                    <Link href={`${projectsHref}&openPublish=1`} onClick={() => setMobileOpen(false)} className={mobileDrawerItemClass}>
                      <DrawerIcon><ClipboardList /></DrawerIcon>
                      <span className={mobileDrawerTextClass}>{t("publishRequest")}</span>
                    </Link>
                    {!isPro && (
                      <Link href={projectsHref} onClick={() => setMobileOpen(false)} className={claseCajon(projectsHref)}>
                        <DrawerIcon><ClipboardList /></DrawerIcon>
                        <span className={mobileDrawerTextClass}>{t("projects")}</span>
                      </Link>
                    )}
                    {mostrarOfrecerServicios && (
                      <Link
                        href="/registro/profesional"
                        onClick={() => setMobileOpen(false)}
                        className={cn(mobileDrawerItemClass, "text-[#009FD9] hover:bg-[#EBF5FB]")}
                      >
                        <DrawerIcon><UserRoundPlus /></DrawerIcon>
                        <span className={mobileDrawerTextClass}>{t("offerServices")}</span>
                      </Link>
                    )}
                    {/* En la app, quien tiene cuenta profesional lleva Cotizaciones
                        fija en la barra de abajo, así que el Asistente vive aquí.
                        Las cuentas de solo cliente lo tienen en la barra. */}
                    {nativeHeaderShell && isPro && (
                      <button type="button" onClick={() => { setMobileOpen(false); window.dispatchEvent(new Event("contratacr:open-ai")); }} className={mobileDrawerItemClass}>
                        <DrawerIcon><Bot /></DrawerIcon>
                        <span className={mobileDrawerTextClass}>{tNav("assistant")}</span>
                      </button>
                    )}
                  </>
                ) : null}
                {/* Buscar profesionales ABRE EL BUSCADOR, no la página de
                    resultados: la hoja de servicio y lugar se monta encima de
                    donde estés y /buscar solo se carga cuando ya hay algo que
                    buscar. Entrar a /buscar «por si acaso» traía todas las
                    fichas y el mapa en cada visita, que es lo caro. */}
                <button
                  type="button"
                  onClick={() => { setMobileOpen(false); openNativeSearch(); }}
                  className={mobileDrawerItemClass}
                >
                  <DrawerIcon><Search /></DrawerIcon>
                  <span className={mobileDrawerTextClass}>{t("searchProfessionals")}</span>
                </button>
                <Link href="/servicios" onClick={() => setMobileOpen(false)} className={claseCajon("/servicios")}>
                  <DrawerIcon><Wrench /></DrawerIcon>
                  <span className={mobileDrawerTextClass}>{t("categories")}</span>
                </Link>
                {!nativeHeaderShell && (
                  <>
                {EMPLEOS_VISIBLE && (
                  <Link href="/empleos" onClick={(event) => { setMobileOpen(false); navigateNativeMarketplace(event, "/empleos"); }} className={claseCajon("/empleos")}>
                    <DrawerIcon><Briefcase /></DrawerIcon>
                    <span className={mobileDrawerTextClass}>{locale === "en" ? "Jobs" : "Empleos"}</span>
                  </Link>
                )}
                <Link href="/ofertas" onClick={(event) => { setMobileOpen(false); navigateNativeMarketplace(event, "/ofertas"); }} className={claseCajon("/ofertas")}>
                  <DrawerIcon><OfferTagPercentIcon className="h-5 w-5" /></DrawerIcon>
                  <span className={mobileDrawerTextClass}>{locale === "en" ? "Deals" : "Ofertas"}</span>
                </Link>
                  </>
                )}
                {user && isAdminUser && (
                  <Link href="/admin" onClick={() => setMobileOpen(false)} className={mobileDrawerItemClass}>
                    <DrawerIcon><Shield /></DrawerIcon>
                    <span className={mobileDrawerTextClass}>{locale === "en" ? "Admin panel" : "Panel admin"}</span>
                  </Link>
                )}
                {!user && (
                  <>
                    <Link
                      href={loginHref}
                      onClick={() => setMobileOpen(false)}
                      className={mobileDrawerItemClass}
                    >
                      <DrawerIcon><UserRound /></DrawerIcon>
                      <span className={mobileDrawerTextClass}>{t("login")}</span>
                    </Link>
                    {/* Entrar y crear cuenta son dos cosas distintas: quien no
                        tiene cuenta no debe deducirla desde «Ingresar». */}
                    <Link
                      href="/registro"
                      onClick={() => setMobileOpen(false)}
                      className={mobileDrawerItemClass}
                    >
                      <DrawerIcon><UserRoundPlus /></DrawerIcon>
                      <span className={mobileDrawerTextClass}>{t("register")}</span>
                    </Link>
                  </>
                )}

                <div className="mt-1">
                  <button
                    type="button"
                    onClick={() => setMobileHelpOpen((open) => !open)}
                    className={cn(mobileDrawerItemClass, "gap-2")}
                    aria-expanded={mobileHelpOpen}
                  >
                    <DrawerIcon><HelpCircle /></DrawerIcon>
                    <span className="min-w-0 flex-1 whitespace-nowrap">{locale === "en" ? "Help and support" : "Ayuda y soporte"}</span>
                    <ChevronDown className={cn("h-5 w-5 shrink-0 text-[#64748b] transition-transform", mobileHelpOpen && "rotate-180")} />
                  </button>
                  {mobileHelpOpen && (
                    <div className="mt-1 grid gap-1 pl-[52px]">
                      <Link href="/como-funciona" onClick={() => setMobileOpen(false)} className={mobileDrawerSubItemClass}>
                        <ResourceIcon name="howItWorks" />
                        <span className={mobileDrawerTextClass}>{t("resourceLinks.howItWorks")}</span>
                      </Link>
                      <Link href="/ayuda" onClick={() => setMobileOpen(false)} className={mobileDrawerSubItemClass}>
                        <ResourceIcon name="helpCenter" />
                        <span className={mobileDrawerTextClass}>{t("resourceLinks.helpCenter")}</span>
                      </Link>
                      <Link href="/atraer-clientes" onClick={() => setMobileOpen(false)} className={mobileDrawerSubItemClass}>
                        <ResourceIcon name="proTips" />
                        <span className={mobileDrawerTextClass}>{t("resourceLinks.proTips")}</span>
                      </Link>
                      <SupportLink onNavigate={() => setMobileOpen(false)} className={mobileDrawerSubItemClass}>
                        <ResourceIcon name="support" />
                        <span className={mobileDrawerTextClass}>{t("resourceLinks.support")}</span>
                      </SupportLink>
                      {nativeHeaderShell && (
                        <>
                          <Link href="/terminos" onClick={() => setMobileOpen(false)} className={mobileDrawerSubItemClass}>
                            <ResourceIcon name="terms" />
                            <span className={mobileDrawerTextClass}>{t("resourceLinks.terms")}</span>
                          </Link>
                          <Link href="/privacidad" onClick={() => setMobileOpen(false)} className={mobileDrawerSubItemClass}>
                            <ResourceIcon name="privacy" />
                            <span className={mobileDrawerTextClass}>{t("resourceLinks.privacy")}</span>
                          </Link>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    switchLang(alternateLocale);
                    setMobileOpen(false);
                  }}
                  className={mobileDrawerItemClass}
                >
                  <DrawerIcon><Globe2 /></DrawerIcon>
                  <span className={mobileDrawerTextClass}>{alternateLanguageLabel}</span>
                </button>
              </nav>
              {user && (
                <>
                  {/* Misma fila que los demás destinos del menú: una pastilla
                      rellena lo hacía ver como la acción principal del cajón,
                      que no lo es. */}
                  <button
                    type="button"
                    onClick={() => {
                      setMobileHelpOpen(false);
                      setMobileOpen(false);
                      void handleSignOut();
                    }}
                    className={mobileDrawerItemClass}
                  >
                    <DrawerIcon><LogOut /></DrawerIcon>
                    <span className={mobileDrawerTextClass}>{locale === "en" ? "Sign out" : "Cerrar sesión"}</span>
                  </button>
                </>
              )}
            </div>
          </div>
      </>
    </>
  );
}
