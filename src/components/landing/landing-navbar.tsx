"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  X, Menu, ChevronDown, ChevronRight, Search, MapPin, LogIn,
  LayoutDashboard, LogOut, Bookmark, CalendarCheck, CalendarClock, CalendarDays, ClipboardList, Handshake, Briefcase, Compass, Bell, Globe, Check,
  HelpCircle, Lightbulb, Headset, ListChecks, UserRound, Wrench, Award, CreditCard,
} from "lucide-react";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { signOutToHome } from "@/lib/auth/sign-out";
import { useAuth } from "@/hooks/use-auth";
import { canOffer } from "@/lib/auth/capabilities";
import { useMode, type Mode } from "@/hooks/use-mode";
import { notificationContext } from "@/lib/notification-link";
import { getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AnchoredDropdown } from "@/components/ui/anchored-dropdown";
import { CategorySuggestionBox } from "@/components/ui/category-suggestion";
import { ModeSwitcher } from "@/components/ui/mode-switcher";
import { SupportLink } from "@/components/support/support-link";
import { PAYMENTS_ENABLED } from "@/lib/payments/config";
import { ALL_CATEGORIES, CATEGORY_GROUPS, searchCategories, normalizeText, getCategoryLabel, getCategoryGroupLabel, resolveCategoryIntent, getAllCategories, getAllCategoryGroups } from "@/lib/data/categories";
import { getCategoryGroupIcon } from "@/lib/data/category-group-visuals";
import { useCustomCategories } from "@/lib/data/use-custom-categories";
import { searchLocations, resolveLocation, type LocationSuggestion } from "@/lib/data/location-search";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

/* ─── Brand mark (the square "CR" icon) ─── */
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

/* ─── Logo (mark + wordmark). `size="lg"` gives the header more brand presence. ─── */
export function ContrataCRLogo({ className, chip = false, size = "md", tone = "light" }: { className?: string; chip?: boolean; size?: "md" | "lg"; tone?: "light" | "dark" }) {
  const lg = size === "lg";
  const markCls = lg ? "h-8 w-8 sm:h-9 sm:w-9" : "h-7 w-7";
  const textCls = lg ? "text-[19px] sm:text-[22px]" : "text-[17px]";
  const chipCls = lg ? "h-9 w-9 sm:h-10 sm:w-10" : "h-8 w-8";
  const chipMarkCls = lg ? "h-6 w-6 sm:h-7 sm:w-7" : "h-[1.35rem] w-[1.35rem]";
  const dark = tone === "dark";
  return (
    <div className={cn("flex items-center select-none", lg ? "gap-2.5" : "gap-2", className)}>
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

/* ─── Language switch — shared locale-change helper ─── */
const LANGS = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
] as const;
function useTypedPlaceholder(examples: string[], active: boolean) {
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

function useSwitchLang() {
  const router = useRouter();
  const pathname = usePathname();
  return (lang: string) => {
    const currentState =
      typeof window === "undefined" ? "" : `${window.location.search}${window.location.hash}`;
    if (typeof window !== "undefined") {
      localStorage.setItem("contratacr_lang", lang);
      // Persist as the NEXT_LOCALE cookie so the choice survives a fresh visit
      // to an unprefixed URL (the proxy in src/proxy.ts reads it). 1-year, site-wide.
      document.cookie = `NEXT_LOCALE=${lang}; path=/; max-age=31536000; samesite=lax`;
    }
    router.replace(`${pathname}${currentState}`, { locale: lang, scroll: false });
  };
}

/* ─── Language menu (DESKTOP navbar) ─── */
function LanguageMenu() {
  const locale = useLocale();
  const switchLang = useSwitchLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onOutside(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, []);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Cambiar idioma / Change language"
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-full border px-3 text-[12px] font-bold transition-all",
          open
            ? "border-[#bfe3f5] bg-[#EBF5FB] text-[#0089bb] shadow-[0_10px_26px_-20px_rgba(0,159,217,0.85)]"
            : "border-[#e8eef5] bg-white text-[#374151] shadow-[0_8px_24px_-22px_rgba(15,23,42,0.6)] hover:border-[#ccecf8] hover:bg-[#f8fbfd] hover:text-[#162543]"
        )}
      >
        <Globe className={cn("h-4 w-4", open ? "text-[#0089bb]" : "text-[#9ca3af]")} aria-hidden />
        <span>{locale.toUpperCase()}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-[#9ca3af] transition-transform duration-200", open && "rotate-180 text-[#0089bb]")} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-2xl border border-[#e8eef5] bg-white p-1.5 shadow-[0_24px_70px_-24px_rgba(15,23,42,0.5)]">
          {LANGS.map((l) => {
            const active = locale === l.code;
            return (
              <button
                key={l.code}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => { setOpen(false); switchLang(l.code); }}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                  active ? "bg-[#EBF5FB] font-semibold text-[#0089bb]" : "text-[#374151] hover:bg-[#f8fafc] hover:text-[#162543]",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{l.label}</span>
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-[#9ca3af]">{l.code}</span>
                </span>
                <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full", active ? "bg-[#009FD9] text-white" : "bg-[#f3f4f6] text-transparent")}>
                  <Check className="h-3.5 w-3.5" />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Language inline (mobile hamburger drawer) ─── */
function LanguageInline({ className }: { className?: string }) {
  const locale = useLocale();
  const switchLang = useSwitchLang();
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2",
        className
      )}
      role="group"
      aria-label="Cambiar idioma / Change language"
    >
      {LANGS.map((l) => {
        const active = locale === l.code;
        return (
          <button
            key={l.code}
            onClick={() => switchLang(l.code)}
            aria-pressed={active}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-xl border px-3 text-sm font-bold transition-all",
              active
                ? "border-[#009FD9] bg-[#009FD9] text-white shadow-sm"
                : "border-[#dbe7ef] bg-white text-[#64748b] shadow-sm hover:border-[#bfe3f5] hover:text-[#162543]",
            )}
          >
            <span>{l.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Mode segmented control (Cliente ⇆ Profesional) ───
   The canonical pattern for switching between two views/contexts: BOTH modes
   shown side by side, the active one FILLED (brand), the inactive one muted but
   clearly tappable — tapping it switches the whole experience. (Carbon-style
   content switcher / iOS segmented control.) Accessible (role=tablist/tab,
   ArrowLeft/Right operable), smooth fill transition, fits the navbar at ~360px.
   `block` makes the two segments share the full width (used in the account menu
   + mobile drawer); the inline default is used in the navbar bar.
   NO notification badge — context switchers stay clean; notifications live in the
   bell (modern-app practice). */
/* In the navbar itself we still keep one compact account entry point. Inside that
   account menu/drawer, providers can switch Cliente/Profesional in place. */

/* ─── Header data ───
   The "Categorías" mega-menu (desktop) is built from the FULL catalog `CATEGORY_GROUPS`
   (sprint 525) — every group + its categories, organized with group headers. On mobile the
   drawer shows just a single "Servicios" link -> /servicios. */

// `key` resolves to header.resourceLinks.<key> for the translated label.
const RESOURCES_LINKS: { key: string; href: string }[] = [
  { key: "helpCenter", href: "/ayuda" },
  { key: "proTips",    href: "/atraer-clientes" },
  { key: "support",    href: "/soporte" },
];
const RESOURCE_ICONS = {
  howItWorks: ListChecks,
  helpCenter: HelpCircle,
  proTips: Lightbulb,
  support: Headset,
} as const;

/* ─── Accent- and typo-tolerant category matcher ───
   `searchCategories` already does accent-insensitive substring matching over
   labels + keywords; if that yields nothing we fall back to a small edit-
   distance match so minor typos ("plomeria"→"plomeira", "electicidad") still
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

/* ─── Smart category search with autocomplete ───
   Used both inside the Categorías mega-menu and as the compact (scrolled)
   header search. Selecting a suggestion jumps straight to /buscar filtered by
   that category; free text falls back to a keyword search. */
function CategoryAutocomplete({
  placeholder = "Busca un servicio…",
  autoFocus = false,
  province,
  onNavigate,
  size = "md",
}: {
  placeholder?: string;
  autoFocus?: boolean;
  province?: string;
  onNavigate?: () => void;
  size?: "md" | "lg";
}) {
  const t = useTranslations("header");
  // Shared category-suggestion strings — keeps the navbar's "no results / ¿No ves tu
  // categoría?" wording IDENTICAL to the crear-proyecto / agregar-profesión picker.
  const ts = useTranslations("categorySearch");
  const tp = useTranslations("categoriesPage");
  const locale = useLocale();
  const router = useRouter();
  const customCategories = useCustomCategories();
  void customCategories;
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  // True while the inline "suggest a category" box is open/just-sent, so the dropdown
  // stays open even though the search input lost focus to the suggestion field.
  const [suggestActive, setSuggestActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestions = useMemo(() => matchCategories(q, 8, locale), [q, locale, customCategories]);

  useEffect(() => {
    if (autoFocus) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [autoFocus]);
  useEffect(() => { queueMicrotask(() => setActive(0)); }, [q]);

  function go(id?: string) {
    const params = new URLSearchParams();
    if (id) params.set("categoria", id);
    else if (q.trim()) params.set("q", q.trim());
    if (province) params.set("provincia", province);
    router.push(`/buscar${params.toString() ? `?${params.toString()}` : ""}`);
    setQ("");
    setFocused(false);
    onNavigate?.();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(suggestions[active]?.id); }
    else if (e.key === "Escape") { setFocused(false); inputRef.current?.blur(); }
  }

  // Stay open while the suggest box is in use (the search input has blurred to it).
  const open = (focused || suggestActive) && q.trim().length > 0;
  const lg = size === "lg";

  return (
    <div className="relative w-full">
      <form
        ref={formRef}
        onSubmit={(e) => { e.preventDefault(); go(suggestions[active]?.id); }}
        className={cn(
          "flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/70 transition-all focus-within:border-[#009FD9] focus-within:ring-2 focus-within:ring-[#009FD9]/20 focus-within:bg-white",
          lg ? "h-12 px-4" : "h-10 px-3",
        )}
      >
        <Search className="h-4 w-4 text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { if (blurTimer.current) clearTimeout(blurTimer.current); setFocused(true); }}
          onBlur={() => { blurTimer.current = setTimeout(() => setFocused(false), 150); }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={t("searchServiceAria")}
          className="flex-1 min-w-0 bg-transparent text-base sm:text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
        />
      </form>

      <AnchoredDropdown anchorRef={formRef} open={open} maxHeight={340} className="rounded-xl border-gray-100 shadow-2xl">
        <div className="py-1.5">
          {suggestions.length === 0 ? (
            <>
              {/* No match → consistent "No encontramos esa categoría" wording + the SAME
                  inline suggest flow used in crear-proyecto / agregar-profesión (submits to
                  admin). The "Ver todos los profesionales" link was removed (sprint 305). */}
              <div className="px-4 pt-3 pb-2 text-center">
                <p className="text-sm font-extrabold text-[#162543]">{tp("notListed")}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#6b7280]">{tp("suggestDescription")}</p>
              </div>
              <div className="flex justify-center px-4 pb-3">
                <CategorySuggestionBox
                  prominent
                  defaultName={q}
                  notListedLabel={tp("suggestCta")}
                  placeholder={tp("suggestPlaceholder")}
                  sendLabel={tp("suggestSend")}
                  sendingLabel={tp("suggestSending")}
                  cancelLabel={ts("cancel")}
                  thanksLabel={tp("suggestThanks")}
                  onActiveChange={setSuggestActive}
                />
              </div>
            </>
          ) : (
            suggestions.map((s, i) => (
              <button
                key={s.id}
                onMouseDown={(e) => { e.preventDefault(); go(s.id); }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors",
                  active === i ? "bg-[#EBF5FB]" : "hover:bg-gray-50",
                )}
              >
                <span className="text-sm font-medium text-[#1a2744]">{getCategoryLabel(s.id, locale)}</span>
                {suggestions.length > 1 && (
                  <span className="text-[11px] text-gray-400 shrink-0">{getCategoryGroupLabel(s.groupId, locale)}</span>
                )}
              </button>
            ))
          )}
        </div>
      </AnchoredDropdown>
    </div>
  );
}

/* ─── Categorías mega-menu panel ───
   ONE clean container: the search field FILTERS the curated category list IN PLACE as
   you type — never a second floating dropdown stacked on top of the mega-menu. Empty →
   the curated 3-column grid; typing → matching categories inline; no match → the shared
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
  const customCategories = useCustomCategories();
  void customCategories;
  const menuCategories = getAllCategories();
  const menuGroups = getAllCategoryGroups().map((group) => ({
    id: group.id,
    iconKey: group.iconKey,
    items: menuCategories.filter((category) => category.groupId === group.id),
  }));
  const matches = useMemo(() => matchCategories(q, 18, locale), [q, locale, customCategories]);
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
      {/* Search — inline; typing filters the list below IN PLACE (no portal/overlay). */}
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
                      <span className="mt-0.5 block text-[11px] font-medium text-[#9ca3af]">{ts("optionsCount", { count: items.length })}</span>
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
                      <p className="mt-0.5 text-[11px] font-medium text-[#9ca3af]">{ts("optionsCount", { count: activeGroup.items.length })}</p>
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
          // No match → consistent wording + the shared suggest flow, all INSIDE this same
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
                    <span className="mt-0.5 block text-[11px] font-medium text-[#9ca3af]">{ts("optionsCount", { count: group.items.length })}</span>
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
                      href={`/buscar?categoria=${selectedGroup.items[0].id}`}
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

/* ─── Account menu (avatar trigger + dropdown) ───
   Self-contained: owns its open state + tap-away handling, so it can be
   rendered in BOTH the default header row AND the compact/scrolled row
   without sharing state. `onOpen` lets the parent refresh the unread count. */
interface AccountMenuProps {
  user: { email?: string | null };
  isPro: boolean;
  mode: Mode;
  displayName: string;
  avatarUrl: string | null;
  avatarReady: boolean;
  initials: string;
  professionalPanelHref: string;
  clientPanelHref: string;
  professionalProfileHref: string;
  clientProfileHref: string;
  servicesHref: string;
  photosHref: string;
  availabilityHref: string;
  bookingsHref: string;
  proposalsHref: string;
  subscriptionHref: string;
  sentBookingsHref: string;
  sentProjectsHref: string;
  savedHref: string;
  notificationsHrefByMode: Record<Mode, string>;
  supportPanelHref: string;
  notifUnreadByMode: Record<Mode, number>;
  onSignOut: () => void;
  onOpen?: () => void;
}

function AccountMenu({
  user, isPro, mode, displayName, avatarUrl, avatarReady, initials,
  professionalPanelHref, clientPanelHref, clientProfileHref, professionalProfileHref, servicesHref, photosHref, availabilityHref, bookingsHref, proposalsHref,
  subscriptionHref, sentBookingsHref, sentProjectsHref, savedHref, notificationsHrefByMode, supportPanelHref,
  notifUnreadByMode, onSignOut, onOpen,
}: AccountMenuProps) {
  const t = useTranslations("header");
  const td = useTranslations("proPanel");
  const [open, setOpen] = useState(false);
  const [menuMode, setMenuMode] = useState<Mode>(mode);
  const ref = useRef<HTMLDivElement>(null);
  const menuItemClass = "flex items-center gap-2.5 px-3 py-2 text-sm text-[#374151] hover:bg-[#f9fafb] transition-colors";
  const menuDividerClass = "mt-1 border-t border-gray-50 pt-1";
  const selectedMenuMode = isPro ? menuMode : "use";
  const notifUnread = notifUnreadByMode[selectedMenuMode] ?? 0;

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
    setOpen((o) => {
      if (!o) {
        setMenuMode(mode);
        onOpen?.();
      }
      return !o;
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        className="flex items-center gap-1 p-0.5 rounded-full ring-2 ring-transparent hover:ring-[#009FD9]/30 transition-all"
        title={displayName || user.email || ""}
      >
        {!avatarReady ? (
          // Avatar state not resolved yet → a NEUTRAL skeleton, never the initials
          // circle, so an account WITH a photo never flashes the no-photo state.
          <span className="block h-8 w-8 animate-pulse rounded-full bg-gray-200" />
        ) : (
          <Avatar className="h-8 w-8">
            <AvatarImage src={avatarUrl ?? undefined} />
            <AvatarFallback delayMs={avatarUrl ? 600 : 0} className="text-[12px] bg-[#009FD9] text-white font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 max-h-[min(720px,calc(100vh-92px))] w-72 overflow-y-auto bg-white border border-gray-100 rounded-2xl shadow-[0_22px_55px_-18px_rgba(15,23,42,0.45)] z-50 py-1.5">
          <div className="px-3 py-2 border-b border-gray-50 mb-1">
            {displayName && <p className="text-sm font-semibold text-[#111827] truncate">{displayName}</p>}
            <p className="text-xs text-[#9ca3af] truncate">{user.email}</p>
          </div>

          <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t("myAccount")}</p>
          {isPro && (
            <div className="px-3 pb-2">
              <ModeSwitcher mode={menuMode} onSwitch={setMenuMode} block />
            </div>
          )}

          <div className={menuDividerClass}>
            <a
              href={isPro && selectedMenuMode === "offer" ? professionalPanelHref : clientPanelHref}
              onClick={() => setOpen(false)}
              className={menuItemClass}
            >
              <LayoutDashboard className="h-4 w-4 text-[#009FD9]" />
              {t("myPanel")}
            </a>
            {isPro && selectedMenuMode === "offer" ? (
              <>
                <a href={bookingsHref} onClick={() => setOpen(false)} className={menuItemClass}>
                  <CalendarCheck className="h-4 w-4 text-gray-400" />
                  {td("tabs.bookings")}
                </a>
                <a href={proposalsHref} onClick={() => setOpen(false)} className={menuItemClass}>
                  <Handshake className="h-4 w-4 text-gray-400" />
                  {td("tabs.proposals")}
                </a>
                <a href={professionalProfileHref} onClick={() => setOpen(false)} className={menuItemClass}>
                  <UserRound className="h-4 w-4 text-gray-400" />
                  {td("tabs.profile")}
                </a>
                <a href={servicesHref} onClick={() => setOpen(false)} className={menuItemClass}>
                  <Wrench className="h-4 w-4 text-gray-400" />
                  {td("tabs.services")}
                </a>
                <a href={photosHref} onClick={() => setOpen(false)} className={menuItemClass}>
                  <Award className="h-4 w-4 text-gray-400" />
                  {td("tabs.photos")}
                </a>
                <a href={availabilityHref} onClick={() => setOpen(false)} className={menuItemClass}>
                  <CalendarDays className="h-4 w-4 text-gray-400" />
                  {td("tabs.availability")}
                </a>
                {PAYMENTS_ENABLED && (
                  <a href={subscriptionHref} onClick={() => setOpen(false)} className={menuItemClass}>
                    <CreditCard className="h-4 w-4 text-gray-400" />
                    {td("tabs.suscripcion")}
                  </a>
                )}
              </>
            ) : (
              <>
                <a href={sentBookingsHref} onClick={() => setOpen(false)} className={menuItemClass}>
                  <CalendarClock className="h-4 w-4 text-gray-400" />
                  {td("tabs.sent_bookings")}
                </a>
                <a href={sentProjectsHref} onClick={() => setOpen(false)} className={menuItemClass}>
                  <ClipboardList className="h-4 w-4 text-gray-400" />
                  {td("tabs.sent_projects")}
                </a>
                <a href={clientProfileHref} onClick={() => setOpen(false)} className={menuItemClass}>
                  <UserRound className="h-4 w-4 text-gray-400" />
                  {td("tabs.profile")}
                </a>
                <a href={savedHref} onClick={() => setOpen(false)} className={menuItemClass}>
                  <Bookmark className="h-4 w-4 text-gray-400" />
                  {td("tabs.saved")}
                </a>
              </>
            )}
          </div>

          <div>
            <a
              href={notificationsHrefByMode[selectedMenuMode]}
              onClick={() => setOpen(false)}
              className={menuItemClass}
            >
              <Bell className="h-4 w-4 text-gray-400" />
              <span className="flex-1">{t("notifications")}</span>
              {notifUnread > 0 && (
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#009FD9] px-1 text-[10px] font-bold text-white">{notifUnread > 9 ? "9+" : notifUnread}</span>
              )}
            </a>
            <a
              href={supportPanelHref}
              onClick={() => setOpen(false)}
              className={menuItemClass}
            >
              <Headset className="h-4 w-4 text-gray-400" />
              {t("supportTickets")}
            </a>
          </div>

          {!isPro && (
            <Link
              href="/registro/profesional"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 mt-1 border-t border-gray-50 text-sm text-[#009FD9] hover:bg-[#EBF5FB] transition-colors"
            >
              <Briefcase className="h-4 w-4" />
              {t("offerServices")}
            </Link>
          )}

          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 mt-1 border-t border-gray-50 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {t("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Navbar ───
   `mobileInline` (optional): content injected into the MOBILE header row only (<lg),
   between the logo and the hamburger — used by /buscar to put the search + filters on the
   SAME single line as the logo + menu. When present, the mobile logo compacts to the mark
   (the wordmark would crowd the row at ~360px). Desktop + pages that don't pass it are
   unchanged. */
export function LandingNavbar({ mobileInline }: { mobileInline?: React.ReactNode } = {}) {
  const [compact, setCompact] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const customCategories = useCustomCategories();
  void customCategories;
  // A picked category (so a chosen suggestion filters by id, not free text).
  const [searchCategoryId, setSearchCategoryId] = useState<string | null>(null);
  const [searchActiveIdx, setSearchActiveIdx] = useState(-1);
  const [searchFocused, setSearchFocused] = useState(false);
  // Location is a typeable autocomplete (provinces + cantones), like the hero.
  const [navLocation, setNavLocation] = useState("");
  const [navLocationSel, setNavLocationSel] = useState<LocationSuggestion | null>(null);
  const [navLocOpen, setNavLocOpen] = useState(false);
  const [navLocActive, setNavLocActive] = useState(-1);
  const navLocBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compactSvcRef = useRef<HTMLDivElement>(null);
  const compactLocRef = useRef<HTMLDivElement>(null);
  // Drives a SHORTER search placeholder on small screens so it never clips.
  const [isSmallScreen, setIsSmallScreen] = useState(true);
  const searchBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawerTouchX = useRef<number | null>(null);
  const router = useRouter();
  const t = useTranslations("header");
  const td = useTranslations("proPanel");
  const locale = useLocale();
  const pathname = usePathname();
  const { user, avatarUrl, avatarReady } = useAuth();
  const compactSearchExamples = useMemo(() => {
    const raw = t.raw(isSmallScreen ? "searchExamples" : "searchExamplesDesktop");
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  }, [isSmallScreen, t]);
  const compactPlaceholder = useTypedPlaceholder(compactSearchExamples, compact && !searchFocused && !searchQuery.trim());

  // "Ingresar" routes to the robust /login PAGE (forgot-password, role-aware
  // post-login redirect to the correct panel, waitForAuthCookie, OAuth `next`,
  // social-only detection). NO `redirect` param: the navbar only sits on PUBLIC
  // pages and login must land on the user's DASHBOARD — a generic public redirect
  // would OVERRIDE the role-based panel redirect (the "login lands on the main page"
  // bug). Meaningful deep-links (support tickets, gated pages) carry their OWN
  // ?redirect= via the proxy and are still honored by /login.
  const loginHref = "/login";

  // `isPro` = the account can OFFER services (Airbnb "host" capability). It only
  // controls menu LABELS/grouping now — everyone uses the ONE unified panel.
  const isPro = canOffer(user);
  const initials = getInitials(user?.user_metadata?.full_name ?? user?.email ?? "?");
  const displayName = (user?.user_metadata?.full_name as string) || (user?.user_metadata?.name as string) || user?.email?.split("@")[0] || "";
  const { mode } = useMode(isPro);
  const [drawerMode, setDrawerMode] = useState<Mode>(mode);

  // ONE unified panel ("Mi panel") for every account; it opens in the right mode
  // by itself. The "Usar servicios" sections live under their own tabs there.
  const panelHref = `/${locale}/dashboard/profesional`;
  const panelTabHref = (tab: string, targetMode: Mode = mode) => `${panelHref}?tab=${tab}&mode=${targetMode}`;
  const professionalPanelHref = `${panelHref}?mode=offer`;
  const clientPanelHref = `${panelHref}?mode=use`;
  const primaryPanelHref = isPro ? (mode === "offer" ? professionalPanelHref : clientPanelHref) : clientPanelHref;
  const professionalProfileHref = panelTabHref("profile", "offer");
  const clientProfileHref = panelTabHref("profile", "use");
  const servicesHref = panelTabHref("services", "offer");
  const photosHref = panelTabHref("photos", "offer");
  const availabilityHref = panelTabHref("availability", "offer");
  const bookingsHref = panelTabHref("bookings", "offer");
  const proposalsHref = panelTabHref("proposals", "offer");
  const subscriptionHref = panelTabHref("suscripcion", "offer");
  const sentBookingsHref = panelTabHref("sent_bookings", "use");
  const sentProjectsHref = panelTabHref("sent_projects", "use");
  const savedHref = panelTabHref("saved", "use");
  const supportPanelHref = `${panelHref}?tab=soporte`;
  const notificationsHrefByMode: Record<Mode, string> = {
    offer: panelTabHref("notifications", "offer"),
    use: panelTabHref("notifications", "use"),
  };
  const visibleResourceLinks = useMemo(
    () => RESOURCES_LINKS.filter((link) => link.key !== "proTips" || !user || isPro),
    [isPro, user],
  );

  // Airbnb FULL mode switch: providers can change Cliente/Profesional from the
  // panel header or account menus, and the navbar reads that mode for quick links.
  // Keep notifications in and out of the panel aligned: outside the panel, we
  // show the same mode-scoped feed as the active navbar mode (or client mode for
  // accounts without offer capability). This avoids confusing cross-mode mixes.
  const notificationScope: "all" | Mode = pathname.startsWith("/dashboard/profesional")
    ? mode
    : pathname.startsWith("/dashboard/cliente")
      ? "use"
      : isPro
        ? mode
        : "use";

  // Unread counts, split by mode (the bell handles its own live updates; this refreshes
  // when the menu/drawer opens). Professional + client notifications drive the active-mode
  // badge and the OTHER-mode awareness badge on the switch; support/unknown show in both.
  const [proUnread, setProUnread] = useState(0);
  const [clientUnread, setClientUnread] = useState(0);
  const [neutralUnread, setNeutralUnread] = useState(0);
  const refreshNotifUnread = useCallback(() => {
    if (!user) { setProUnread(0); setClientUnread(0); setNeutralUnread(0); return; }
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("type")
      .eq("user_id", user.id)
      .eq("read", false)
      .then(({ data }) => {
        let pro = 0, cli = 0, neu = 0;
        for (const n of data ?? []) {
          const ctx = notificationContext(n.type as string);
          if (ctx === "professional") pro++;
          else if (ctx === "client") cli++;
          else neu++;
        }
        setProUnread(pro); setClientUnread(cli); setNeutralUnread(neu);
      });
  }, [user]);
  useEffect(() => {
    queueMicrotask(() => refreshNotifUnread());
    const id = window.setInterval(refreshNotifUnread, 3000);
    window.addEventListener("notificationsChanged", refreshNotifUnread);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("notificationsChanged", refreshNotifUnread);
    };
  }, [refreshNotifUnread, mobileOpen]);
  // Switching Cliente/Profesional inside a menu only swaps menu options/counts;
  // it does not change the panel beneath it.
  const notifUnreadByMode: Record<Mode, number> = {
    offer: proUnread + neutralUnread,
    use: clientUnread + neutralUnread,
  };
  const selectedDrawerMode: Mode = isPro ? drawerMode : "use";
  const drawerNotificationsHref = notificationsHrefByMode[selectedDrawerMode];
  const drawerUnread = notifUnreadByMode[selectedDrawerMode] ?? 0;
  const openMobileMenu = useCallback(() => {
    setDrawerMode(mode);
    setMobileOpen(true);
    queueMicrotask(() => refreshNotifUnread());
  }, [mode, refreshNotifUnread]);
  const mobileRowBase = "relative flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors before:absolute before:left-0 before:top-3 before:bottom-3 before:w-0.5 before:rounded-r-full before:bg-[#009FD9] before:transition-opacity";
  const mobileRowClass = (active: boolean, strong = false) => cn(
    mobileRowBase,
    active
      ? "bg-[#EBF5FB] text-[#0089bb] before:opacity-100"
      : strong
        ? "text-[#162543] before:opacity-0 hover:bg-[#f8fafc] hover:text-[#0089bb]"
      : "text-[#4b5563] before:opacity-0 hover:bg-[#f8fafc] hover:text-[#0089bb]"
  );
  const mobileIconClass = (active: boolean) => cn("h-4 w-4 shrink-0", active ? "text-[#009FD9]" : "text-[#9ca3af]");
  const mobileChevronClass = (active: boolean) => cn("h-4 w-4 shrink-0", active ? "text-[#009FD9]/60" : "text-gray-300");

  const compactSuggestions = useMemo(() => matchCategories(searchQuery, 8, locale), [searchQuery, locale, customCategories]);
  const navLocSug = useMemo(() => searchLocations(navLocation), [navLocation]);

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

  async function handleSignOut() {
    // Go STRAIGHT home — `signOutToHome` flags the in-flight sign-out so protected
    // pages (dashboards, etc.) don't bounce the now-absent user to /login mid-logout.
    await signOutToHome(locale);
  }

  useEffect(() => {
    const sentinel = document.getElementById("hero-search-sentinel");
    if (!sentinel) {
      const handler = () => setCompact(window.scrollY > 300);
      handler();
      window.addEventListener("scroll", handler, { passive: true });
      return () => window.removeEventListener("scroll", handler);
    }
    const observer = new IntersectionObserver(
      ([entry]) => setCompact(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-64px 0px 0px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  function openDropdown(id: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenMenu(id);
  }
  function closeDropdown() {
    closeTimer.current = setTimeout(() => setOpenMenu(null), 120);
  }


  // Build params from current state and navigate. Runs ONLY on Buscar/Enter.
  function runCompactSearch() {
    const params = new URLSearchParams();
    const svc = searchQuery.trim();
    const picked = compactSuggestions.find((c) => c.id === searchCategoryId);
    if (searchCategoryId && picked && picked.label === searchQuery) {
      params.set("categoria", searchCategoryId);
    } else if (svc) {
      const inferred = resolveCategoryIntent(svc, locale);
      if (inferred) params.set("categoria", inferred.id);
      else params.set("q", svc);
    }
    const loc = navLocationSel && navLocationSel.label === navLocation ? navLocationSel : resolveLocation(navLocation);
    if (loc) {
      if (loc.type === "province") params.set("provincia", loc.id);
      else params.set("canton", loc.id);
    }
    setSearchFocused(false);
    setNavLocOpen(false);
    router.push(`/buscar?${params.toString()}`);
  }

  function handleCompactSearch(e: React.FormEvent) {
    e.preventDefault();
    runCompactSearch();
  }

  // Selecting a suggestion FILLS the field — it does NOT search immediately.
  function selectCompactSuggestion(id: string) {
    const picked = compactSuggestions.find((c) => c.id === id);
    if (picked) {
      setSearchQuery(picked.label);
      setSearchCategoryId(id);
    }
    setSearchActiveIdx(-1);
    setSearchFocused(false);
  }

  function selectNavLocation(s: LocationSuggestion) {
    setNavLocation(s.label);
    setNavLocationSel(s);
    setNavLocOpen(false);
    setNavLocActive(-1);
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
        selectCompactSuggestion(compactSuggestions[searchActiveIdx].id);
        return;
      } else if (e.key === "Escape") {
        setSearchFocused(false);
        return;
      }
    }
    if (e.key === "Enter") {
      e.preventDefault();
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
      runCompactSearch();
    }
  }

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-white/96 backdrop-blur-md shadow-[0_10px_34px_-24px_rgba(15,23,42,0.55)] border-b border-gray-100/80"
      >
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="relative h-16">

            {/* ── Default row ── */}
            <div
              className="absolute inset-0 flex items-center gap-4 transition-opacity duration-300"
              style={{ opacity: compact ? 0 : 1, pointerEvents: compact ? "none" : "auto" }}
            >
              <Link href="/" aria-label="ContrataCR inicio" className="shrink-0">
                {mobileInline ? (
                  <>
                    {/* Compact mark on mobile ONLY when the inline search is present (it needs the
                        row); the full logo + wordmark on desktop. */}
                    <ContrataCRMark className="h-8 w-8 lg:hidden" />
                    <span className="hidden lg:inline-flex"><ContrataCRLogo size="lg" /></span>
                  </>
                ) : (
                  /* Mode switch left the navbar (sprint 518) → there's room for the FULL logo +
                     "ContrataCR" wordmark on mobile again. */
                  <ContrataCRLogo size="lg" />
                )}
              </Link>

              {/* MOBILE inline slot (search + filters) — only when provided, only <lg. */}
              {mobileInline && (
                <div className="lg:hidden flex min-w-0 flex-1 items-center gap-2">{mobileInline}</div>
              )}

              <nav className="hidden lg:flex items-center gap-0.5">
                {/* Categorías — mega-menu with autocomplete + curated columns */}
                <div
                  className="relative"
                  onMouseEnter={() => openDropdown("categorias")}
                  onMouseLeave={closeDropdown}
                >
                  <button
                    type="button"
                    aria-expanded={openMenu === "categorias"}
                    onClick={() => setOpenMenu(openMenu === "categorias" ? null : "categorias")}
                    className={cn(
                      "relative flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors after:absolute after:left-4 after:right-4 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-[#009FD9] after:transition-opacity",
                      openMenu === "categorias"
                        ? "text-[#1a2744] bg-gray-50 after:opacity-0"
                        : "text-[#374151] after:opacity-0 hover:text-[#1a2744] hover:bg-gray-50"
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

                <Link
                  href="/como-funciona"
                  className="relative text-sm font-medium px-3 py-2 text-[#374151] transition-colors whitespace-nowrap after:absolute after:left-3 after:right-3 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-[#009FD9] after:opacity-0 hover:text-[#1a2744]"
                >
                  {t("resourceLinks.howItWorks")}
                </Link>

                {/* Recursos — simple dropdown */}
                <div
                  className="relative"
                  onMouseEnter={() => openDropdown("recursos")}
                  onMouseLeave={closeDropdown}
                >
                  <button
                    className={cn(
                      "relative flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors after:absolute after:left-4 after:right-4 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-[#009FD9] after:transition-opacity",
                      openMenu === "recursos" ? "text-[#1a2744] bg-gray-50 after:opacity-0" : "text-[#374151] after:opacity-0 hover:text-[#1a2744] hover:bg-gray-50"
                    )}
                  >
                    {t("resources")}
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", openMenu === "recursos" && "rotate-180")} />
                  </button>
                  {openMenu === "recursos" && (
                    <div
                      className="absolute top-full left-0 mt-1.5 bg-white rounded-2xl shadow-[0_24px_70px_-22px_rgba(15,23,42,0.45)] border border-gray-100 p-4 z-50 min-w-[220px]"
                      style={{ animation: "tab-cards-in 0.15s ease both" }}
                    >
                      <ul className="space-y-1">
                        {visibleResourceLinks.map((link) => (
                          <li key={link.href}>
                            {link.key === "support" ? (
                              <SupportLink
                                onNavigate={() => setOpenMenu(null)}
                                className="block w-full text-left px-3 py-2 rounded-lg text-sm text-gray-600 hover:text-[#009FD9] hover:bg-gray-50 transition-colors"
                              >
                                {t(`resourceLinks.${link.key}`)}
                              </SupportLink>
                            ) : (
                              <Link
                                href={link.href}
                                onClick={() => setOpenMenu(null)}
                                className="block px-3 py-2 rounded-lg text-sm text-gray-600 hover:text-[#009FD9] hover:bg-gray-50 transition-colors"
                              >
                                {t(`resourceLinks.${link.key}`)}
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </nav>

              {/* Spacer — on mobile the inline slot (when present) is the flex filler instead,
                  so hide this one to avoid two competing flex-1 (which would halve the search). */}
              <div className={cn("flex-1", mobileInline && "hidden lg:block")} />

              {/* Right actions */}
              <div className="hidden lg:flex items-center gap-2 shrink-0">
                {user ? (
                  <div className="flex items-center gap-1">
                    {!isPro && (
                      <Link
                        href="/registro/profesional"
                        className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl text-[#009FD9] hover:bg-[#EBF5FB] transition-colors whitespace-nowrap"
                      >
                        <Briefcase className="h-4 w-4" />
                        {t("offerServices")}
                      </Link>
                    )}
                    {/* The context switcher lives inside account menus/drawers, keeping this bar compact. */}
                    <a
                      href={primaryPanelHref}
                      className="relative text-sm font-medium px-3 py-2 text-[#374151] transition-colors whitespace-nowrap after:absolute after:left-3 after:right-3 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-[#009FD9] after:opacity-0 hover:text-[#1a2744]"
                    >
                      {t("myPanel")}
                    </a>
                    <NotificationBell scope={notificationScope} />
                    <AccountMenu
                      user={user}
                      isPro={isPro}
                      mode={mode}
                      displayName={displayName}
                      avatarUrl={avatarUrl}
                      avatarReady={avatarReady}
                      initials={initials}
                      professionalPanelHref={professionalPanelHref}
                      clientPanelHref={clientPanelHref}
                      professionalProfileHref={professionalProfileHref}
                      clientProfileHref={clientProfileHref}
                      servicesHref={servicesHref}
                      photosHref={photosHref}
                      availabilityHref={availabilityHref}
                      bookingsHref={bookingsHref}
                      proposalsHref={proposalsHref}
                      subscriptionHref={subscriptionHref}
                      sentBookingsHref={sentBookingsHref}
                      sentProjectsHref={sentProjectsHref}
                      savedHref={savedHref}
                      notificationsHrefByMode={notificationsHrefByMode}
                      supportPanelHref={supportPanelHref}
                      notifUnreadByMode={notifUnreadByMode}
                      onSignOut={handleSignOut}
                      onOpen={refreshNotifUnread}
                    />
                  </div>
                ) : (
                  <>
                    <Link
                      href="/registro/profesional"
                      className="ml-1 inline-flex items-center bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-5 py-2.5 rounded-full transition-all duration-150 active:scale-[0.97] shadow-sm hover:shadow-[0_4px_20px_rgba(0,159,217,0.35)] whitespace-nowrap"
                    >
                      {t("registerPro")}
                    </Link>
                    <Link
                      href={loginHref}
                      className="text-sm font-medium px-3 py-2 rounded-xl text-[#374151] hover:bg-gray-50 transition-colors"
                    >
                      {t("login")}
                    </Link>
                  </>
                )}
                {/* Discreet, quiet globe + code dropdown — visually subordinate to the
                    prominent MODE segmented control (never a competing toggle). */}
                <LanguageMenu />
              </div>

              {/* Mobile toggle — only OPENS the drawer; the drawer has the single X. */}
              <button
                type="button"
                onClick={openMobileMenu}
                className="lg:hidden ml-auto p-2 rounded-xl text-[#1a2744] hover:bg-gray-50 transition-colors"
                aria-label={t("openMenu")}
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>

            {/* ── Compact row — brand mark + smart search (Thumbtack-style) ── */}
            <div
              className="absolute inset-0 flex items-center gap-2 sm:gap-3 px-4 sm:px-6 lg:px-8 transition-opacity duration-300"
              style={{ opacity: compact ? 1 : 0, pointerEvents: compact ? "auto" : "none" }}
            >
              <Link
                href="/"
                aria-label="ContrataCR inicio"
                className="relative z-20 shrink-0 -ml-1 grid place-items-center p-1 rounded-lg active:bg-gray-100 touch-manipulation"
              >
                <ContrataCRMark className="h-9 w-9" />
              </Link>
              <form onSubmit={handleCompactSearch} className="flex-1 min-w-0 flex justify-center">
                <div className="relative w-full max-w-5xl">
                  <div className="flex w-full items-center h-12 bg-white border border-gray-200 rounded-[6px] overflow-hidden pl-3 sm:pl-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)]">
                    <div ref={compactSvcRef} className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 h-full">
                      <Search className="hidden h-5 w-5 shrink-0 text-gray-300 sm:block" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setSearchCategoryId(null); setSearchActiveIdx(-1); }}
                        onKeyDown={handleCompactSearchKeyDown}
                        onFocus={() => { if (searchBlurTimer.current) clearTimeout(searchBlurTimer.current); setSearchFocused(true); }}
                        onBlur={() => { searchBlurTimer.current = setTimeout(() => setSearchFocused(false), 150); }}
                        placeholder={compactPlaceholder || (isSmallScreen ? t("servicePlaceholderShort") : t("servicePlaceholder"))}
                        className="flex-1 text-base text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none min-w-0"
                        role="combobox"
                        aria-expanded={searchFocused && searchQuery.trim().length > 0}
                        aria-autocomplete="list"
                        aria-controls="navbar-service-suggestions"
                      />
                    </div>
                    <div className="hidden sm:block w-px bg-gray-200 self-stretch my-3 mx-2 shrink-0" />
                    <div ref={compactLocRef} className="hidden sm:flex items-center gap-2 min-w-[150px] shrink-0 h-full">
                      <MapPin className="h-5 w-5 text-gray-300 shrink-0" />
                      <input
                        type="text"
                        value={navLocation}
                        onChange={(e) => { setNavLocation(e.target.value); setNavLocationSel(null); setNavLocOpen(true); setNavLocActive(-1); }}
                        onKeyDown={handleNavLocKeyDown}
                        onFocus={() => { if (navLocBlurTimer.current) clearTimeout(navLocBlurTimer.current); if (navLocSug.length > 0) setNavLocOpen(true); }}
                        onBlur={() => { navLocBlurTimer.current = setTimeout(() => setNavLocOpen(false), 150); }}
                        placeholder={t("location")}
                        className="flex-1 w-full text-base text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none min-w-0"
                        role="combobox"
                        aria-expanded={navLocOpen}
                        aria-autocomplete="list"
                        aria-controls="navbar-location-suggestions"
                      />
                    </div>
                    <button
                      type="submit"
                      aria-label={t("search")}
                      className="h-full self-stretch rounded-none rounded-r-[5px] bg-[#009FD9] px-4 text-sm font-bold text-white transition-colors hover:bg-[#0089bb] sm:px-8 sm:text-[15px] whitespace-nowrap shrink-0 inline-flex items-center justify-center gap-1.5"
                    >
                      <Search className="h-4 w-4 sm:hidden" />
                      <span className="hidden sm:inline">{t("search")}</span>
                    </button>
                  </div>

                  {/* Service autocomplete — selecting FILLS the field; search
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

                  {/* Location autocomplete (desktop) — selecting FILLS the field. */}
                  <AnchoredDropdown anchorRef={compactLocRef} open={navLocOpen && navLocSug.length > 0} maxHeight={320} className="rounded-xl border-gray-100 shadow-2xl">
                    <div id="navbar-location-suggestions" role="listbox" className="py-1.5">
                      {navLocSug.map((s, i) => (
                        <button
                          key={`${s.type}-${s.id}`}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); selectNavLocation(s); }}
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

              {/* Desktop keeps bell + account menu in the compact row. On mobile,
                  the hamburger is the single entry point so account options do not
                  split across two menus. */}
              {user && (
                <div className="hidden lg:flex items-center gap-0.5 sm:gap-1.5 shrink-0">
                  <NotificationBell scope={notificationScope} />
                  <AccountMenu
                    user={user}
                    isPro={isPro}
                    mode={mode}
                    displayName={displayName}
                    avatarUrl={avatarUrl}
                    avatarReady={avatarReady}
                    initials={initials}
                    professionalPanelHref={professionalPanelHref}
                    clientPanelHref={clientPanelHref}
                    professionalProfileHref={professionalProfileHref}
                    clientProfileHref={clientProfileHref}
                    servicesHref={servicesHref}
                    photosHref={photosHref}
                    availabilityHref={availabilityHref}
                    bookingsHref={bookingsHref}
                    proposalsHref={proposalsHref}
                    subscriptionHref={subscriptionHref}
                    sentBookingsHref={sentBookingsHref}
                    sentProjectsHref={sentProjectsHref}
                    savedHref={savedHref}
                    notificationsHrefByMode={notificationsHrefByMode}
                    supportPanelHref={supportPanelHref}
                    notifUnreadByMode={notifUnreadByMode}
                    onSignOut={handleSignOut}
                    onOpen={refreshNotifUnread}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={openMobileMenu}
                className="lg:hidden ml-1 shrink-0 p-2 rounded-xl text-[#1a2744] hover:bg-gray-50 transition-colors"
                aria-label={t("openMenu")}
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* Mobile menu — slide-in LEFT drawer + scrim (OUTSIDE <header>: the
          header's backdrop-filter would otherwise become the containing block
          for these `fixed` elements, breaking full-viewport positioning). */}
        <div
          className={cn(
            "lg:hidden fixed inset-0 z-[100] bg-black/50 transition-opacity duration-300",
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
            "lg:hidden fixed top-0 left-0 bottom-0 z-[101] w-[88%] max-w-[380px] bg-[#f8fafc] shadow-[18px_0_60px_-18px_rgba(15,23,42,0.5)] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {/* Drawer header — logo (home link) + close */}
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#e8eef5] bg-white px-4 shadow-sm">
            <Link href="/" aria-label="ContrataCR inicio" onClick={() => setMobileOpen(false)}>
              <ContrataCRLogo size="lg" />
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label={t("closeMenu")}
              className="p-2 rounded-xl text-[#1a2744] hover:bg-gray-50 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scrollable content - mirrors the desktop navbar with mobile icon rows. */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="overflow-hidden rounded-2xl border border-[#e8eef5] bg-white shadow-[0_18px_45px_-26px_rgba(15,23,42,0.65)]">
              {/* Smart search on mobile */}
              <div className="border-b border-[#edf2f7] p-2">
                <CategoryAutocomplete
                  placeholder={t("searchServicePlaceholderShort")}
                  size="lg"
                  onNavigate={() => setMobileOpen(false)}
                />
              </div>

              {user ? (
                <div className="p-1.5">
                  <div className="mb-1 flex items-center gap-3 rounded-xl bg-[#f8fafc] px-3 py-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={avatarUrl ?? undefined} />
                      <AvatarFallback delayMs={avatarUrl ? 600 : 0} className="bg-[#009FD9] text-xs font-bold text-white">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#162543]">{displayName || t("myAccount")}</p>
                      <p className="truncate text-xs text-[#9ca3af]">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {isPro && (
                      <div className="px-2 pb-2 pt-1">
                        <ModeSwitcher mode={drawerMode} onSwitch={setDrawerMode} block />
                      </div>
                    )}
                    <div className="mt-1 flex flex-col gap-0.5 border-t border-[#edf2f7] pt-1">
                      {isPro && selectedDrawerMode === "offer" ? (
                        <>
                          <a href={bookingsHref} onClick={() => setMobileOpen(false)} className={mobileRowClass(false)}>
                            <CalendarCheck className={mobileIconClass(false)} />
                            <span className="min-w-0 flex-1">{td("tabs.bookings")}</span>
                            <ChevronRight className={mobileChevronClass(false)} />
                          </a>
                          <a href={proposalsHref} onClick={() => setMobileOpen(false)} className={mobileRowClass(false)}>
                            <Handshake className={mobileIconClass(false)} />
                            <span className="min-w-0 flex-1">{td("tabs.proposals")}</span>
                            <ChevronRight className={mobileChevronClass(false)} />
                          </a>
                          <a href={professionalProfileHref} onClick={() => setMobileOpen(false)} className={mobileRowClass(false)}>
                            <UserRound className={mobileIconClass(false)} />
                            <span className="min-w-0 flex-1">{td("tabs.profile")}</span>
                            <ChevronRight className={mobileChevronClass(false)} />
                          </a>
                          <a href={servicesHref} onClick={() => setMobileOpen(false)} className={mobileRowClass(false)}>
                            <Wrench className={mobileIconClass(false)} />
                            <span className="min-w-0 flex-1">{td("tabs.services")}</span>
                            <ChevronRight className={mobileChevronClass(false)} />
                          </a>
                          <a href={photosHref} onClick={() => setMobileOpen(false)} className={mobileRowClass(false)}>
                            <Award className={mobileIconClass(false)} />
                            <span className="min-w-0 flex-1">{td("tabs.photos")}</span>
                            <ChevronRight className={mobileChevronClass(false)} />
                          </a>
                          <a href={availabilityHref} onClick={() => setMobileOpen(false)} className={mobileRowClass(false)}>
                            <CalendarDays className={mobileIconClass(false)} />
                            <span className="min-w-0 flex-1">{td("tabs.availability")}</span>
                            <ChevronRight className={mobileChevronClass(false)} />
                          </a>
                          {PAYMENTS_ENABLED && (
                            <a href={subscriptionHref} onClick={() => setMobileOpen(false)} className={mobileRowClass(false)}>
                              <CreditCard className={mobileIconClass(false)} />
                              <span className="min-w-0 flex-1">{td("tabs.suscripcion")}</span>
                              <ChevronRight className={mobileChevronClass(false)} />
                            </a>
                          )}
                        </>
                      ) : (
                        <>
                          <a href={sentBookingsHref} onClick={() => setMobileOpen(false)} className={mobileRowClass(false)}>
                            <CalendarClock className={mobileIconClass(false)} />
                            <span className="min-w-0 flex-1">{td("tabs.sent_bookings")}</span>
                            <ChevronRight className={mobileChevronClass(false)} />
                          </a>
                          <a href={sentProjectsHref} onClick={() => setMobileOpen(false)} className={mobileRowClass(false)}>
                            <ClipboardList className={mobileIconClass(false)} />
                            <span className="min-w-0 flex-1">{td("tabs.sent_projects")}</span>
                            <ChevronRight className={mobileChevronClass(false)} />
                          </a>
                          <a href={clientProfileHref} onClick={() => setMobileOpen(false)} className={mobileRowClass(false)}>
                            <UserRound className={mobileIconClass(false)} />
                            <span className="min-w-0 flex-1">{td("tabs.profile")}</span>
                            <ChevronRight className={mobileChevronClass(false)} />
                          </a>
                          <a href={savedHref} onClick={() => setMobileOpen(false)} className={mobileRowClass(false)}>
                            <Bookmark className={mobileIconClass(false)} />
                            <span className="min-w-0 flex-1">{td("tabs.saved")}</span>
                            <ChevronRight className={mobileChevronClass(false)} />
                          </a>
                        </>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <a href={drawerNotificationsHref} onClick={() => setMobileOpen(false)} className={mobileRowClass(false)}>
                        <Bell className={mobileIconClass(false)} />
                        <span className="min-w-0 flex-1">{t("notifications")}</span>
                        {drawerUnread > 0 && (
                          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#009FD9] px-1 text-[10px] font-bold text-white">{drawerUnread > 9 ? "9+" : drawerUnread}</span>
                        )}
                        <ChevronRight className={mobileChevronClass(false)} />
                      </a>
                      <a href={supportPanelHref} onClick={() => setMobileOpen(false)} className={mobileRowClass(false)}>
                        <Headset className={mobileIconClass(false)} />
                        <span className="min-w-0 flex-1">{t("supportTickets")}</span>
                        <ChevronRight className={mobileChevronClass(false)} />
                      </a>
                    </div>
                    {!isPro && (
                      <Link href="/registro/profesional" onClick={() => setMobileOpen(false)} className={mobileRowClass(false, true)}>
                        <Briefcase className={mobileIconClass(false)} />
                        <span className="min-w-0 flex-1">{t("offerServices")}</span>
                        <ChevronRight className={mobileChevronClass(false)} />
                      </Link>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-1.5">
                  <div className="flex flex-col gap-0.5">
                    <Link
                      href="/registro/profesional"
                      onClick={() => setMobileOpen(false)}
                      className="inline-flex w-fit px-3 py-2 text-sm font-medium text-[#009FD9] transition-colors hover:text-[#007fae]"
                    >
                      {t("registerPro")}
                    </Link>
                    <Link
                      href={loginHref}
                      onClick={() => setMobileOpen(false)}
                      className={mobileRowClass(false)}
                    >
                      <LogIn className={mobileIconClass(false)} />
                      <span className="min-w-0 flex-1">{t("login")}</span>
                      <ChevronRight className={mobileChevronClass(false)} />
                    </Link>
                  </div>
                </div>
              )}

              <div className="mt-1 border-t border-[#dbe3ea] bg-white/70 p-1.5">
                <div className="flex flex-col gap-0.5">
                  <Link
                    href="/servicios"
                    onClick={() => setMobileOpen(false)}
                    className={mobileRowClass(false, true)}
                  >
                    <Compass className={mobileIconClass(false)} />
                    <span className="min-w-0 flex-1">{t("categories")}</span>
                    <ChevronRight className={mobileChevronClass(false)} />
                  </Link>
                  {visibleResourceLinks.filter((link) => link.key !== "support").map((link) => {
                    const ResourceIcon = RESOURCE_ICONS[link.key as keyof typeof RESOURCE_ICONS];
                    const content = (
                      <>
                        <ResourceIcon className={mobileIconClass(false)} />
                        <span className="min-w-0 flex-1">{t(`resourceLinks.${link.key}`)}</span>
                        <ChevronRight className={mobileChevronClass(false)} />
                      </>
                    );
                    return link.key === "support" ? (
                      <SupportLink
                        key={link.href}
                        onNavigate={() => setMobileOpen(false)}
                        className={mobileRowClass(false)}
                      >
                        {content}
                      </SupportLink>
                    ) : (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setMobileOpen(false)}
                        className={mobileRowClass(false)}
                      >
                        {content}
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Idioma */}
              <div className="px-3 pb-3 pt-1.5">
                <LanguageInline />
              </div>
            </div>

            {/* Cerrar sesión — logged-in only, at the very bottom */}
            {user && (
              <div className="mt-4">
                <button onClick={handleSignOut}
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50">
                  <LogOut className="h-4 w-4" /> {t("signOut")}
                </button>
              </div>
            )}
          </div>
        </div>
    </>
  );
}
