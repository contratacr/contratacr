"use client";

import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from "react";
import {
  X, Menu, ChevronDown, ChevronRight, Search, MapPin,
  LayoutDashboard, Briefcase, Compass,
  UserRound, LogOut, FileText, ShieldCheck, MessageSquareText,
  Home, HelpCircle, LifeBuoy, BookOpen, Sparkles, Headset, Globe2,
} from "lucide-react";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
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
import { trackMetaEvent } from "@/lib/analytics/meta-pixel";
import { useNativeApp } from "@/hooks/use-native-app";
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

/* ─── Language switch — shared locale-change helper ─── */
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
  const nextLocale = locale === "en" ? "es" : "en";
  const label = nextLocale.toUpperCase();

  return (
    <button
      type="button"
      onClick={() => switchLang(nextLocale)}
      aria-label={locale === "en" ? "Cambiar a español" : "Switch to English"}
      className="inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-[12px] font-bold uppercase tracking-[0.04em] text-[#1A2744] transition-colors hover:bg-gray-50 hover:text-[#009FD9]"
    >
      {label}
    </button>
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
   without sharing state. */
interface AccountMenuProps {
  user: { email?: string | null };
  isPro: boolean;
  displayName: string;
  avatarUrl: string | null;
  avatarReady: boolean;
  initials: string;
  professionalPanelHref: string;
  clientPanelHref: string;
  onSignOut: () => void;
}

export function AccountMenu({
  user, isPro, displayName, avatarUrl, avatarReady, initials,
  professionalPanelHref, clientPanelHref, onSignOut,
}: AccountMenuProps) {
  const t = useTranslations("header");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuItemClass = "flex items-center gap-2.5 px-3 py-2 text-sm text-[#374151] hover:bg-[#f9fafb] transition-colors";

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
        className="flex items-center gap-1 p-0.5 rounded-full ring-2 ring-transparent hover:ring-[#009FD9]/30 transition-all"
        title={displayName || user.email || ""}
      >
        {!avatarReady ? (
          // Avatar state not resolved yet → a NEUTRAL skeleton, never the initials
          // circle, so an account WITH a photo never flashes the no-photo state.
          <span className="block h-8 w-8 animate-pulse rounded-full bg-gray-200" />
        ) : (
          <span
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[#009FD9] bg-cover bg-center text-[13px] font-bold text-white",
              avatarUrl && "text-transparent",
            )}
            style={avatarUrl ? { backgroundImage: `url("${avatarUrl}")` } : undefined}
          >
            <span aria-hidden>{initials}</span>
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 max-h-[min(720px,calc(100vh-92px))] w-72 overflow-y-auto bg-white border border-gray-100 rounded-2xl shadow-[0_22px_55px_-18px_rgba(15,23,42,0.45)] z-50 py-1.5">
          <div className="px-3 py-2 border-b border-gray-50 mb-1">
            {displayName && <p className="text-sm font-semibold text-[#111827] truncate">{displayName}</p>}
            <p className="text-xs text-[#9ca3af] truncate">{user.email}</p>
          </div>

          <div className="pt-1">
            <Link
              href={isPro ? professionalPanelHref : clientPanelHref}
              onClick={() => setOpen(false)}
              className={menuItemClass}
            >
              <LayoutDashboard className="h-4 w-4 text-[#009FD9]" />
              {t("myPanel")}
            </Link>
          </div>

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
function PanelIconLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="grid h-10 w-10 place-items-center rounded-xl text-[#1A2744] transition-colors hover:bg-[#f3f4f6] hover:text-[#009FD9]"
    >
      <UserRound className="h-5 w-5" />
    </Link>
  );
}

function HeaderIconLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="grid h-10 w-10 place-items-center rounded-xl text-[#1A2744] transition-colors hover:bg-[#f3f4f6] hover:text-[#009FD9]"
    >
      {children}
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

export function LandingNavbar({ mobileInline, forceCompactSearch = false }: { mobileInline?: React.ReactNode; forceCompactSearch?: boolean } = {}) {
  const [compact, setCompact] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileLegalOpen, setMobileLegalOpen] = useState(false);
  const [mobileHelpOpen, setMobileHelpOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  useCustomCategories();
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
  const locale = useLocale();
  const switchLang = useSwitchLang();
  const alternateLocale = locale === "en" ? "es" : "en";
  const alternateLanguageLabel = locale === "en" ? "Español" : "English";
  const pathname = usePathname();
  const nativeApp = useNativeApp();
  const { user, loading: authLoading } = useAuth();
  const compactEnabled = !pathname.startsWith("/dashboard");
  const effectiveCompact = compactEnabled && (forceCompactSearch || compact);
  const compactSearchExamples = useMemo(() => {
    const raw = t.raw(isSmallScreen ? "searchExamples" : "searchExamplesDesktop");
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  }, [isSmallScreen, t]);
  const compactPlaceholder = useTypedPlaceholder(compactSearchExamples, effectiveCompact && !searchFocused && !searchQuery.trim());

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
  const { mode } = useMode(isPro);

  // ONE unified panel ("Mi panel") for every account; it opens in the right mode
  // by itself. The "Usar servicios" sections live under their own tabs there.
  const panelHref = "/dashboard/profesional";
  const professionalPanelHref = `${panelHref}?mode=offer`;
  const clientPanelHref = `${panelHref}?mode=use`;
  const primaryPanelHref = isPro ? (mode === "offer" ? professionalPanelHref : clientPanelHref) : clientPanelHref;

  // Warm the two most common destinations after the current page settles. This
  // keeps the initial render light while making the first panel/search transition
  // use Next's prefetched route payload instead of waiting after the click.
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!pathname.startsWith("/buscar")) router.prefetch("/buscar");
      if (user && !pathname.startsWith("/dashboard/profesional")) {
        router.prefetch(primaryPanelHref);
        prefetchDashboardBootstrap(user.id);
      }
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [pathname, primaryPanelHref, router, user]);

  const visibleResourceLinks = useMemo(
    () => RESOURCES_LINKS.filter((link) => link.key !== "proTips" || !user || isPro),
    [isPro, user],
  );
  const mobileDrawerItemClass =
    "flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left text-[17px] font-semibold leading-snug text-[#162543] transition-colors hover:bg-[#f4f7fa] hover:text-[#009FD9]";
  const mobileDrawerStrongItemClass = cn(mobileDrawerItemClass, "font-extrabold");
  const mobileDrawerSubItemClass =
    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold leading-snug text-[#374151] transition-colors hover:bg-[#f4f7fa] hover:text-[#009FD9]";

  const openMobileMenu = useCallback(() => {
    setMobileLegalOpen(false);
    setMobileHelpOpen(false);
    setMobileOpen(true);
  }, []);

  const compactSuggestions = matchCategories(searchQuery, 8, locale);
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
    if (!compactEnabled) {
      const timeout = window.setTimeout(() => setCompact(false), 0);
      return () => window.clearTimeout(timeout);
    }
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
  }, [compactEnabled]);

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
    trackMetaEvent("Search", {
      content_type: "professional_service",
      search_string: params.get("categoria") ? "category" : params.get("q") ? "text" : "general",
      has_location: params.has("provincia") || params.has("canton"),
      source: "navbar",
    });
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
        className="fixed top-0 left-0 right-0 z-50 bg-white/96 backdrop-blur-md shadow-[0_10px_34px_-24px_rgba(15,23,42,0.55)] border-b border-gray-100/80"
      >
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="relative h-16">
            <div className="absolute inset-0 flex items-center gap-2 lg:hidden">
              <button
                type="button"
                onClick={openMobileMenu}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#1a2744] transition-colors hover:bg-gray-50"
                aria-label={t("openMenu")}
              >
                <Menu className="h-5 w-5" />
              </button>

              <Link href="/" aria-label="ContrataCR inicio" className="shrink-0">
                {mobileInline ? <ContrataCRMark className="h-8 w-8" /> : <ContrataCRLogo size="lg" />}
              </Link>

              {mobileInline && (
                <div className="flex min-w-0 flex-1 items-center gap-2">{mobileInline}</div>
              )}

              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                {nativeApp && user && (
                  <HeaderIconLink href="/mensajes" label={locale === "en" ? "Messages" : "Mensajes"}>
                    <MessageSquareText className="h-5 w-5" />
                  </HeaderIconLink>
                )}
                {user && <NotificationBell scope="all" />}
                <Link
                  href={user ? primaryPanelHref : loginHref}
                  aria-label={user ? t("myPanel") : t("login")}
                  className="grid h-10 w-10 place-items-center rounded-xl text-[#1A2744] transition-colors hover:bg-gray-50"
                >
                  <UserRound className="h-5 w-5" />
                </Link>
              </div>
            </div>

            {/* ── Default row ── */}
            <div
              className="absolute inset-0 hidden items-center gap-4 transition-opacity duration-300 lg:flex"
              style={{ opacity: effectiveCompact ? 0 : 1, pointerEvents: effectiveCompact ? "none" : "auto" }}
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
                        : "text-[#1A2744] after:opacity-0 hover:text-[#009FD9] hover:bg-gray-50"
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
                  className="relative text-sm font-medium px-3 py-2 text-[#1A2744] transition-colors whitespace-nowrap after:absolute after:left-3 after:right-3 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-[#009FD9] after:opacity-0 hover:text-[#009FD9]"
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
                      openMenu === "recursos" ? "text-[#1a2744] bg-gray-50 after:opacity-0" : "text-[#1A2744] after:opacity-0 hover:text-[#009FD9] hover:bg-gray-50"
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
                                className="block w-full text-left px-3 py-2 rounded-lg text-sm text-[#1A2744] hover:text-[#009FD9] hover:bg-gray-50 transition-colors"
                              >
                                {t(`resourceLinks.${link.key}`)}
                              </SupportLink>
                            ) : (
                              <Link
                                href={link.href}
                                onClick={() => setOpenMenu(null)}
                                className="block px-3 py-2 rounded-lg text-sm text-[#1A2744] hover:text-[#009FD9] hover:bg-gray-50 transition-colors"
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
              <div className="hidden w-[340px] justify-end lg:flex items-center gap-2 shrink-0">
                {authLoading && !user ? (
                  <div className="flex w-[250px] items-center justify-end gap-2" aria-hidden="true">
                    <div className="h-10 w-24 animate-pulse rounded-xl bg-[#eef2f6]" />
                    <div className="h-10 w-10 animate-pulse rounded-full bg-[#eef2f6]" />
                  </div>
                ) : user ? (
                  <div className="flex w-[220px] items-center justify-end gap-1">
                    {!isPro && (
                      <Link
                        href="/registro/profesional"
                        className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl text-[#009FD9] hover:bg-[#EBF5FB] transition-colors whitespace-nowrap"
                      >
                        <Briefcase className="h-4 w-4" />
                        {t("offerServices")}
                      </Link>
                    )}
                    {nativeApp && (
                      <HeaderIconLink href="/mensajes" label={locale === "en" ? "Messages" : "Mensajes"}>
                        <MessageSquareText className="h-5 w-5" />
                      </HeaderIconLink>
                    )}
                    <NotificationBell scope="all" />
                    <PanelIconLink href={primaryPanelHref} label={t("myPanel")} />
                  </div>
                ) : (
                  <div className="flex w-[250px] items-center justify-end gap-1">
                    <Link
                      href="/registro/profesional"
                      className="ml-1 inline-flex items-center bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-5 py-2.5 rounded-full transition-all duration-150 active:scale-[0.97] shadow-sm hover:shadow-[0_4px_20px_rgba(0,159,217,0.35)] whitespace-nowrap"
                    >
                      {t("registerPro")}
                    </Link>
                    <Link
                      href={loginHref}
                      className="text-sm font-medium px-3 py-2 rounded-xl text-[#1A2744] hover:bg-gray-50 transition-colors"
                    >
                      {t("login")}
                    </Link>
                  </div>
                )}
                {/* Discreet, quiet globe + code dropdown — visually subordinate to the
                    prominent MODE segmented control (never a competing toggle). */}
                <LanguageMenu />
              </div>

              {/* Mobile toggle — opens the left drawer. */}
              <button
                type="button"
                onClick={openMobileMenu}
                className="lg:hidden ml-auto grid h-10 w-10 place-items-center rounded-xl text-[#1a2744] hover:bg-gray-50 transition-colors"
                aria-label={t("openMenu")}
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>

            {/* ── Compact row — brand mark + smart search (Thumbtack-style) ── */}
            <div
              className="absolute inset-0 hidden items-center gap-2 px-4 transition-opacity duration-300 sm:gap-3 sm:px-6 lg:flex lg:px-8"
              style={{ opacity: effectiveCompact ? 1 : 0, pointerEvents: effectiveCompact ? "auto" : "none" }}
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
              <div className="hidden w-[156px] justify-end lg:flex items-center gap-0.5 sm:gap-1.5 shrink-0">
                <LanguageMenu />
                {nativeApp && user && (
                  <HeaderIconLink href="/mensajes" label={locale === "en" ? "Messages" : "Mensajes"}>
                    <MessageSquareText className="h-5 w-5" />
                  </HeaderIconLink>
                )}
                {user && <NotificationBell scope="all" />}
                {user ? (
                  <PanelIconLink href={primaryPanelHref} label={t("myPanel")} />
                ) : (
                  null
                )}
              </div>
              <button
                type="button"
                onClick={openMobileMenu}
                className="lg:hidden ml-1 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#1a2744] hover:bg-gray-50 transition-colors"
                aria-label={t("openMenu")}
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* Mobile menu — slide-in LEFT drawer + transparent outside click layer (OUTSIDE <header>: the
          header's backdrop-filter would otherwise become the containing block
          for these `fixed` elements, breaking full-viewport positioning). */}
        <div
          className={cn(
            "lg:hidden fixed inset-0 z-[100] bg-transparent transition-opacity duration-300",
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
            "lg:hidden fixed top-0 left-0 bottom-0 z-[101] w-[86vw] max-w-[390px] bg-white shadow-[18px_0_46px_-24px_rgba(15,23,42,0.65)] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex flex-1 flex-col overflow-y-auto bg-white px-5 pb-7 pt-[calc(env(safe-area-inset-top)+28px)]">
            <nav className="flex flex-col gap-1">
              {!nativeApp && (
                <Link href="/" onClick={() => setMobileOpen(false)} className={mobileDrawerItemClass}>
                  <DrawerIcon><Home /></DrawerIcon>
                  <span>{locale === "en" ? "Home" : "Inicio"}</span>
                </Link>
              )}
              {user ? (
                <Link href={primaryPanelHref} onClick={() => setMobileOpen(false)} className={mobileDrawerStrongItemClass}>
                  <DrawerIcon><LayoutDashboard /></DrawerIcon>
                  <span>{locale === "en" ? "My dashboard" : "Mi panel"}</span>
                </Link>
              ) : (
                <Link href="/registro/profesional" onClick={() => setMobileOpen(false)} className={mobileDrawerStrongItemClass}>
                  <DrawerIcon><Briefcase /></DrawerIcon>
                  <span>{t("offerServices")}</span>
                </Link>
              )}
              <Link href="/buscar" onClick={() => setMobileOpen(false)} className={mobileDrawerStrongItemClass}>
                <DrawerIcon><Search /></DrawerIcon>
                <span>{t("searchProfessionals")}</span>
              </Link>
              {nativeApp && user && (
                <Link href="/mensajes" onClick={() => setMobileOpen(false)} className={mobileDrawerStrongItemClass}>
                  <DrawerIcon><MessageSquareText /></DrawerIcon>
                  <span>{locale === "en" ? "Messages" : "Mensajes"}</span>
                </Link>
              )}
              {!user && (
                <Link href={loginHref} onClick={() => setMobileOpen(false)} className={mobileDrawerItemClass}>
                  <DrawerIcon><UserRound /></DrawerIcon>
                  <span>{t("login")}</span>
                </Link>
              )}
              <Link href="/servicios" onClick={() => setMobileOpen(false)} className={mobileDrawerItemClass}>
                <DrawerIcon><Compass /></DrawerIcon>
                <span>{t("categories")}</span>
              </Link>
              <div className="mt-2 border-t border-gray-100 pt-2">
                <button
                  type="button"
                  onClick={() => setMobileHelpOpen((open) => !open)}
                  className={mobileDrawerItemClass}
                  aria-expanded={mobileHelpOpen}
                >
                  <DrawerIcon><HelpCircle /></DrawerIcon>
                  <span className="min-w-0 flex-1">{locale === "en" ? "Help and support" : "Ayuda y soporte"}</span>
                  <ChevronDown className={cn("h-5 w-5 shrink-0 text-[#64748b] transition-transform", mobileHelpOpen && "rotate-180")} />
                </button>
                {mobileHelpOpen && (
                  <div className="mt-1 grid gap-1 pl-[52px]">
                    <Link href="/como-funciona" onClick={() => setMobileOpen(false)} className={mobileDrawerSubItemClass}>
                      <BookOpen className="h-5 w-5 text-[#64748b]" />
                      <span>{t("resourceLinks.howItWorks")}</span>
                    </Link>
                    <Link href="/ayuda" onClick={() => setMobileOpen(false)} className={mobileDrawerSubItemClass}>
                      <LifeBuoy className="h-5 w-5 text-[#64748b]" />
                      <span>{t("resourceLinks.helpCenter")}</span>
                    </Link>
                    <Link href="/atraer-clientes" onClick={() => setMobileOpen(false)} className={mobileDrawerSubItemClass}>
                      <Sparkles className="h-5 w-5 text-[#64748b]" />
                      <span>{t("resourceLinks.proTips")}</span>
                    </Link>
                    <SupportLink onNavigate={() => setMobileOpen(false)} className={mobileDrawerSubItemClass}>
                      <Headset className="h-5 w-5 text-[#64748b]" />
                      <span>{t("resourceLinks.support")}</span>
                    </SupportLink>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  switchLang(alternateLocale);
                }}
                className={mobileDrawerItemClass}
              >
                <DrawerIcon><Globe2 /></DrawerIcon>
                <span>{alternateLanguageLabel}</span>
              </button>
            </nav>
            {nativeApp && (
              <div className="mt-auto border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => setMobileLegalOpen((open) => !open)}
                  className="flex w-full items-center justify-between rounded-xl px-1 py-2 text-left text-[13px] font-bold uppercase tracking-[0.14em] text-[#8a97aa]"
                  aria-expanded={mobileLegalOpen}
                >
                  <span>{locale === "en" ? "Legal" : "Información legal"}</span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", mobileLegalOpen && "rotate-180")} />
                </button>
                {mobileLegalOpen && (
                  <div className="mt-1 grid gap-1">
                    <Link href="/terminos" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 rounded-xl px-2 py-2.5 text-sm font-semibold text-[#1A2744] transition-colors hover:bg-[#f4f7fa]">
                      <FileText className="h-4 w-4 text-[#6b7a90]" />
                      {locale === "en" ? "Terms and conditions" : "Términos y condiciones"}
                    </Link>
                    <Link href="/privacidad" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 rounded-xl px-2 py-2.5 text-sm font-semibold text-[#1A2744] transition-colors hover:bg-[#f4f7fa]">
                      <ShieldCheck className="h-4 w-4 text-[#6b7a90]" />
                      {locale === "en" ? "Privacy policy" : "Política de privacidad"}
                    </Link>
                  </div>
                )}
              </div>
            )}
            {user && (
              <button
                type="button"
                onClick={() => {
                  setMobileLegalOpen(false);
                  setMobileHelpOpen(false);
                  setMobileOpen(false);
                  void handleSignOut();
                }}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#eef2f6] px-4 py-3.5 text-base font-extrabold text-[#162543] transition-colors hover:bg-[#e2e8f0]"
              >
                <LogOut className="h-5 w-5" />
                {t("signOut")}
              </button>
            )}
          </div>
        </div>
    </>
  );
}
