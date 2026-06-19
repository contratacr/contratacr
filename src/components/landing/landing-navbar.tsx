"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  X, Menu, ChevronDown, Search, MapPin,
  LayoutDashboard, LogOut, Bookmark, CalendarDays, FolderOpen, UserPlus, Briefcase, Compass, Settings, Bell, Globe,
} from "lucide-react";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { signOutToHome } from "@/lib/auth/sign-out";
import { useAuth } from "@/hooks/use-auth";
import { getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AnchoredDropdown } from "@/components/ui/anchored-dropdown";
import { CategorySuggestionBox } from "@/components/ui/category-suggestion";
import { SupportLink } from "@/components/support/support-link";
import { ALL_CATEGORIES, searchCategories, normalizeText, getCategoryLabel, getCategoryGroupLabel } from "@/lib/data/categories";
import { searchLocations, resolveLocation, type LocationSuggestion } from "@/lib/data/location-search";

/* ─── Brand mark (the square "CR" icon) ─── */
export function ContrataCRMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-mark.png"
      srcSet="/logo-mark.png 1x, /logo-mark@2x.png 2x"
      alt="ContrataCR"
      width={28}
      height={28}
      className={cn("h-7 w-7 select-none", className)}
    />
  );
}

/* ─── Logo (mark + wordmark). `size="lg"` gives the header more brand presence. ─── */
export function ContrataCRLogo({ className, chip = false, size = "md" }: { className?: string; chip?: boolean; size?: "md" | "lg" }) {
  const lg = size === "lg";
  const markCls = lg ? "h-8 w-8 sm:h-9 sm:w-9" : "h-7 w-7";
  const textCls = lg ? "text-[19px] sm:text-[22px]" : "text-[17px]";
  const chipCls = lg ? "h-9 w-9 sm:h-10 sm:w-10" : "h-8 w-8";
  const chipMarkCls = lg ? "h-6 w-6 sm:h-7 sm:w-7" : "h-[1.35rem] w-[1.35rem]";
  return (
    <div className={cn("flex items-center select-none", lg ? "gap-2.5" : "gap-2", className)}>
      {chip ? (
        <span className={cn("grid place-items-center rounded-lg bg-white shadow-sm", chipCls)}>
          <ContrataCRMark className={chipMarkCls} />
        </span>
      ) : (
        <ContrataCRMark className={markCls} />
      )}
      <span className={cn("font-extrabold tracking-tight leading-none", textCls)}>
        <span className="text-[#1a2744]">Contrata</span>
        <span className="text-[#009FD9]">CR</span>
      </span>
    </div>
  );
}

/* ─── Language Toggle Pill ─── */
function LanguageTogglePill() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchLang(lang: string) {
    if (typeof window !== "undefined") {
      localStorage.setItem("contratacr_lang", lang);
      // Persist as the NEXT_LOCALE cookie so the choice survives a fresh visit
      // to an unprefixed URL (the proxy in src/proxy.ts reads it). 1-year, site-wide.
      document.cookie = `NEXT_LOCALE=${lang}; path=/; max-age=31536000; samesite=lax`;
    }
    router.replace(pathname, { locale: lang });
  }

  return (
    // Globe icon makes it instantly readable as a LANGUAGE control; both
    // languages stay visible with the active one highlighted (brand) and the
    // other clearly tappable. Compact + responsive (fits ~360px).
    <div
      role="group"
      aria-label="Cambiar idioma / Change language"
      className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white pl-2 pr-0.5 py-0.5 shrink-0"
    >
      <Globe className="h-3.5 w-3.5 text-gray-400 shrink-0" aria-hidden />
      <div className="inline-flex rounded-full overflow-hidden text-[12px] font-semibold">
        {["es", "en"].map((lang) => {
          const active = locale === lang;
          return (
            <button
              key={lang}
              onClick={() => switchLang(lang)}
              aria-pressed={active}
              aria-label={lang === "es" ? "Español" : "English"}
              title={lang === "es" ? "Español" : "English"}
              className={cn(
                "px-2 py-0.5 rounded-full transition-colors",
                active ? "bg-[#009FD9] text-white" : "text-gray-500 hover:text-[#1a2744]"
              )}
            >
              {lang.toUpperCase()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Header data ───
   The "Categorías" mega-menu shows a CURATED set of real categories — every
   `id` below is verified against `categories.ts` (the single source of truth),
   so each link lands on the correct /buscar?categoria=<id> filter. The full
   taxonomy is reachable via the autocomplete search + "Ver todas". */
type CatLink = { label: string; id: string };
// `groupKey` resolves to header.catGroups.<groupKey> for the (translated)
// column heading. The per-link `label` stays in Spanish for now — the category
// taxonomy is translated app-wide in its own pass (getCategoryLabel).
const CATEGORY_COLUMNS: { groupKey: string; links: CatLink[] }[] = [
  {
    groupKey: "home",
    links: [
      { label: "Plomería",            id: "plomeria" },
      { label: "Electricidad",        id: "electricidad" },
      { label: "Pintura",             id: "pintura" },
      { label: "Carpintería",         id: "carpinteria" },
      { label: "Remodelación",        id: "remodelacion" },
      { label: "Limpieza del hogar",  id: "limpieza" },
    ],
  },
  {
    groupKey: "outdoor",
    links: [
      { label: "Jardinería",            id: "jardineria" },
      { label: "Construcción",          id: "construccion" },
      { label: "Impermeabilización",    id: "impermeabilizacion" },
      { label: "Poda de árboles",       id: "poda_arboles" },
      { label: "Limpieza de piscinas",  id: "limpieza_piscinas" },
      { label: "Mudanzas",              id: "mudanzas" },
    ],
  },
  {
    groupKey: "more",
    links: [
      { label: "Soporte técnico",          id: "soporte_tecnico" },
      { label: "Cámaras de seguridad",     id: "camaras_seguridad" },
      { label: "Mecánica automotriz",      id: "mecanica" },
      { label: "Belleza y barbería",       id: "peluqueria" },
      { label: "Cuidado infantil / Niñera", id: "cuidado_infantil" },
      { label: "Fumigación",               id: "fumigacion" },
    ],
  },
];

// `key` resolves to header.resourceLinks.<key> for the translated label.
const RESOURCES_LINKS: { key: string; href: string }[] = [
  { key: "howItWorks", href: "/como-funciona" },
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
function matchCategories(query: string, limit = 8): CatMatch[] {
  if (!query.trim()) return [];
  const direct = searchCategories(query);
  if (direct.length) return direct.slice(0, limit);
  const q = normalizeText(query.trim());
  const tol = q.length > 6 ? 2 : 1;
  return ALL_CATEGORIES
    .map((item) => {
      const words = normalizeText(item.label).split(/\s+/);
      const best = Math.min(...words.map((w) => editDistance(w, q)));
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
  const locale = useLocale();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  // True while the inline "suggest a category" box is open/just-sent, so the dropdown
  // stays open even though the search input lost focus to the suggestion field.
  const [suggestActive, setSuggestActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestions = useMemo(() => matchCategories(q), [q]);

  useEffect(() => {
    if (autoFocus) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [autoFocus]);
  useEffect(() => setActive(0), [q]);

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

  // "Ver todos los profesionales" — a CLEAN search: never carries the unmatched
  // term as a `q` filter (only the province context, if any).
  function goAll() {
    const params = new URLSearchParams();
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
          className="flex-1 min-w-0 bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
        />
      </form>

      <AnchoredDropdown anchorRef={formRef} open={open} maxHeight={340} className="rounded-xl border-gray-100 shadow-2xl">
        <div className="py-1.5">
          {suggestions.length === 0 ? (
            <>
              {/* No match → consistent "No encontramos esa categoría" wording, a CLEAN
                  "Ver todos los profesionales" link, and the SAME inline suggest flow
                  used in crear-proyecto / agregar-profesión (submits to admin). */}
              <div className="px-4 pt-3 pb-2 text-center">
                <p className="text-sm font-medium text-[#374151]">{ts("noResults")}</p>
                <p className="mt-0.5 text-xs text-gray-400">{ts("noResultsHint")}</p>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); goAll(); }}
                  className="mt-2 inline-block text-sm font-semibold text-[#009FD9] hover:underline"
                >
                  {t("viewAllProfessionals")}
                </button>
              </div>
              <CategorySuggestionBox
                notListedLabel={ts("notListed")}
                placeholder={ts("suggestNamePlaceholder")}
                sendLabel={ts("send")}
                sendingLabel={ts("sending")}
                cancelLabel={ts("cancel")}
                thanksLabel={ts("suggestThanks")}
                onActiveChange={setSuggestActive}
              />
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
                <span className="text-[11px] text-gray-400 shrink-0">{getCategoryGroupLabel(s.groupId, locale)}</span>
              </button>
            ))
          )}
        </div>
      </AnchoredDropdown>
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
  displayName: string;
  avatarUrl: string | null;
  initials: string;
  proPanelHref: string;
  clientPanelHref: string;
  sentBookingsHref: string;
  sentProjectsHref: string;
  savedHref: string;
  notificationsHref: string;
  accountHref: string;
  notifUnread: number;
  onSignOut: () => void;
  onOpen?: () => void;
}

function AccountMenu({
  user, isPro, displayName, avatarUrl, initials,
  proPanelHref, clientPanelHref, sentBookingsHref, sentProjectsHref,
  savedHref, notificationsHref, accountHref, notifUnread, onSignOut, onOpen,
}: AccountMenuProps) {
  const t = useTranslations("header");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
      if (!o) onOpen?.();
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
        <Avatar className="h-8 w-8">
          <AvatarImage src={avatarUrl ?? undefined} />
          <AvatarFallback delayMs={avatarUrl ? 600 : 0} className="text-[12px] bg-[#009FD9] text-white font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 py-1.5 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-50 mb-1">
            {displayName && <p className="text-sm font-semibold text-[#111827] truncate">{displayName}</p>}
            <p className="text-xs text-[#9ca3af] truncate">{user.email}</p>
          </div>

          {isPro && (
            <a
              href={proPanelHref}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#374151] hover:bg-[#f9fafb] transition-colors"
            >
              <LayoutDashboard className="h-4 w-4 text-[#009FD9]" />
              {t("myPanel")}
            </a>
          )}

          <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            {isPro ? t("hireServices") : t("myAccount")}
          </p>
          {!isPro && (
            <a
              href={`${clientPanelHref}?tab=bookings`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#374151] hover:bg-[#f9fafb] transition-colors"
            >
              <LayoutDashboard className="h-4 w-4 text-[#009FD9]" />
              {t("myPanel")}
            </a>
          )}
          <a
            href={sentBookingsHref}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#374151] hover:bg-[#f9fafb] transition-colors"
          >
            <CalendarDays className="h-4 w-4 text-gray-400" />
            {isPro ? t("sentRequests") : t("myRequests")}
          </a>
          <a
            href={sentProjectsHref}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#374151] hover:bg-[#f9fafb] transition-colors"
          >
            <FolderOpen className="h-4 w-4 text-gray-400" />
            {isPro ? t("publishedProjects") : t("myProjects")}
          </a>
          <a
            href={savedHref}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#374151] hover:bg-[#f9fafb] transition-colors"
          >
            <Bookmark className="h-4 w-4 text-gray-400" />
            {t("favorites")}
          </a>
          <a
            href={notificationsHref}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#374151] hover:bg-[#f9fafb] transition-colors"
          >
            <Bell className="h-4 w-4 text-gray-400" />
            <span className="flex-1">{t("notifications")}</span>
            {notifUnread > 0 && (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{notifUnread > 9 ? "9+" : notifUnread}</span>
            )}
          </a>
          <a
            href={accountHref}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 mt-1 border-t border-gray-50 text-sm text-[#374151] hover:bg-[#f9fafb] transition-colors"
          >
            <Settings className="h-4 w-4 text-gray-400" />
            {t("accountSecurity")}
          </a>

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
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const searchBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawerTouchX = useRef<number | null>(null);
  const router = useRouter();
  const t = useTranslations("header");
  const locale = useLocale();
  const { user, avatarUrl } = useAuth();

  // "Ingresar" routes to the robust /login PAGE (forgot-password, role-aware
  // post-login redirect to the correct panel, waitForAuthCookie, OAuth `next`,
  // social-only detection). NO `redirect` param: the navbar only sits on PUBLIC
  // pages and login must land on the user's DASHBOARD — a generic public redirect
  // would OVERRIDE the role-based panel redirect (the "login lands on the main page"
  // bug). Meaningful deep-links (support tickets, gated pages) carry their OWN
  // ?redirect= via the proxy and are still honored by /login.
  const loginHref = "/login";

  const role = user?.user_metadata?.role as string | undefined;
  const isPro = role === "professional";
  const initials = getInitials(user?.user_metadata?.full_name ?? user?.email ?? "?");
  const displayName = (user?.user_metadata?.full_name as string) || (user?.user_metadata?.name as string) || user?.email?.split("@")[0] || "";

  // A professional is a superset of a client. For a professional the client
  // ("Contratar servicios") sections live INSIDE the unified pro dashboard, so a
  // pro never switches panels; a plain client uses the client dashboard.
  const proPanelHref = `/${locale}/dashboard/profesional`;
  const clientPanelHref = `/${locale}/dashboard/cliente`;
  const primaryPanelHref = isPro ? proPanelHref : clientPanelHref;
  const sentBookingsHref = isPro ? `${proPanelHref}?tab=sent_bookings` : `${clientPanelHref}?tab=bookings`;
  const sentProjectsHref = isPro ? `${proPanelHref}?tab=sent_projects` : `${clientPanelHref}?tab=projects`;
  const savedHref = isPro ? `${proPanelHref}?tab=saved` : `${clientPanelHref}?tab=saved`;
  const accountHref = isPro ? `${proPanelHref}?tab=cuenta` : `${clientPanelHref}?tab=profile`;
  const notificationsHref = isPro ? `${proPanelHref}?tab=notifications` : `${clientPanelHref}?tab=notifications`;
  // Unread notifications count for the account menu + mobile drawer link badges
  // (the bell handles its own live updates; this refreshes when those open).
  const [notifUnread, setNotifUnread] = useState(0);
  const refreshNotifUnread = useCallback(() => {
    if (!user) { setNotifUnread(0); return; }
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("read", false)
      .then(({ count }) => setNotifUnread(count ?? 0));
  }, [user]);
  useEffect(() => { refreshNotifUnread(); }, [refreshNotifUnread, mobileOpen]);

  const compactSuggestions = useMemo(() => matchCategories(searchQuery), [searchQuery]);
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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
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

  function goToCategory(id: string) {
    setOpenMenu(null);
    setMobileOpen(false);
    router.push(`/buscar?categoria=${id}`);
  }

  // Build params from current state and navigate. Runs ONLY on Buscar/Enter.
  function runCompactSearch() {
    const params = new URLSearchParams();
    const svc = searchQuery.trim();
    const picked = compactSuggestions.find((c) => c.id === searchCategoryId);
    if (searchCategoryId && picked && picked.label === searchQuery) {
      params.set("categoria", searchCategoryId);
    } else if (svc) {
      params.set("q", svc);
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
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-white/96 backdrop-blur-md shadow-sm border-b border-gray-100/80"
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
                    {/* Compact mark on mobile (saves room for the inline search), full logo on desktop. */}
                    <ContrataCRMark className="h-8 w-8 lg:hidden" />
                    <span className="hidden lg:inline-flex"><ContrataCRLogo size="lg" /></span>
                  </>
                ) : (
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
                    className={cn(
                      "flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors",
                      openMenu === "categorias" ? "text-[#1a2744] bg-gray-50" : "text-[#374151] hover:text-[#1a2744] hover:bg-gray-50"
                    )}
                  >
                    {t("categories")}
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", openMenu === "categorias" && "rotate-180")} />
                  </button>

                  {openMenu === "categorias" && (
                    <div
                      className="absolute top-full left-0 mt-1.5 bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 z-50 w-[680px]"
                      style={{ animation: "tab-cards-in 0.15s ease both" }}
                    >
                      <div className="mb-4">
                        <CategoryAutocomplete
                          placeholder={t("searchServicePlaceholder")}
                          onNavigate={() => setOpenMenu(null)}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-6">
                        {CATEGORY_COLUMNS.map((col) => (
                          <div key={col.groupKey}>
                            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">{t(`catGroups.${col.groupKey}`)}</h4>
                            <ul className="space-y-2.5">
                              {col.links.map((link) => (
                                <li key={link.id}>
                                  <button
                                    onClick={() => goToCategory(link.id)}
                                    className="text-sm text-gray-600 hover:text-[#009FD9] transition-colors leading-tight block text-left"
                                  >
                                    {getCategoryLabel(link.id, locale)}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 pt-3 border-t border-gray-100">
                        <Link
                          href="/categorias"
                          onClick={() => setOpenMenu(null)}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#009FD9] hover:underline"
                        >
                          <Compass className="h-4 w-4" />
                          {t("viewAllCategories")}
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                {/* "Cómo funciona" lives ONLY inside Recursos now (was also a
                    standalone item here — redundant). Recursos shows it on desktop
                    + mobile, so it stays accessible in one place. */}

                {/* Recursos — simple dropdown */}
                <div
                  className="relative"
                  onMouseEnter={() => openDropdown("recursos")}
                  onMouseLeave={closeDropdown}
                >
                  <button
                    className={cn(
                      "flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors",
                      openMenu === "recursos" ? "text-[#1a2744] bg-gray-50" : "text-[#374151] hover:text-[#1a2744] hover:bg-gray-50"
                    )}
                  >
                    {t("resources")}
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", openMenu === "recursos" && "rotate-180")} />
                  </button>
                  {openMenu === "recursos" && (
                    <div
                      className="absolute top-full left-0 mt-1.5 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-50 min-w-[220px]"
                      style={{ animation: "tab-cards-in 0.15s ease both" }}
                    >
                      <ul className="space-y-1">
                        {RESOURCES_LINKS.map((link) => (
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
                    <a
                      href={primaryPanelHref}
                      className="text-sm font-medium px-3 py-2 text-[#374151] hover:text-[#1a2744] transition-colors whitespace-nowrap"
                    >
                      {t("myPanel")}
                    </a>
                    <NotificationBell />
                    <AccountMenu
                      user={user}
                      isPro={isPro}
                      displayName={displayName}
                      avatarUrl={avatarUrl}
                      initials={initials}
                      proPanelHref={proPanelHref}
                      clientPanelHref={clientPanelHref}
                      sentBookingsHref={sentBookingsHref}
                      sentProjectsHref={sentProjectsHref}
                      savedHref={savedHref}
                      notificationsHref={notificationsHref}
                      accountHref={accountHref}
                      notifUnread={notifUnread}
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
                <LanguageTogglePill />
              </div>

              {/* Mobile toggle — only OPENS the drawer; the drawer has the single X. */}
              <button
                onClick={() => setMobileOpen(true)}
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
                  <div className="flex w-full items-center h-12 bg-white border border-gray-200 rounded-[6px] overflow-hidden pl-3 sm:pl-5 pr-1.5 sm:pr-2 shadow-[0_8px_28px_rgba(0,0,0,0.14)]">
                    <div ref={compactSvcRef} className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 h-full">
                      <Search className="h-5 w-5 text-gray-300 shrink-0" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setSearchCategoryId(null); setSearchActiveIdx(-1); }}
                        onKeyDown={handleCompactSearchKeyDown}
                        onFocus={() => { if (searchBlurTimer.current) clearTimeout(searchBlurTimer.current); setSearchFocused(true); }}
                        onBlur={() => { searchBlurTimer.current = setTimeout(() => setSearchFocused(false), 150); }}
                        placeholder={isSmallScreen ? t("servicePlaceholderShort") : t("servicePlaceholder")}
                        className="flex-1 text-sm sm:text-base text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none min-w-0"
                        role="combobox"
                        aria-expanded={searchFocused && searchQuery.trim().length > 0}
                        aria-autocomplete="list"
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
                      />
                    </div>
                    <button
                      type="submit"
                      aria-label={t("search")}
                      className="ml-1.5 sm:ml-2 h-9 px-3 sm:px-8 bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm sm:text-base font-bold rounded-[4px] transition-colors whitespace-nowrap shrink-0 inline-flex items-center justify-center gap-1.5"
                    >
                      <Search className="h-4 w-4 sm:hidden" />
                      <span className="hidden sm:inline">{t("search")}</span>
                    </button>
                  </div>

                  {/* Service autocomplete — selecting FILLS the field; search
                      runs only on Buscar/Enter. */}
                  <AnchoredDropdown anchorRef={compactSvcRef} open={searchFocused && searchQuery.trim().length > 0} maxHeight={320} className="rounded-xl border-gray-100 shadow-2xl">
                    <div className="py-1.5">
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
                    <div className="py-1.5">
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

              {/* Session access stays in the compact/scrolled row for logged-in
                  users (logo links home above; here: bell + account menu). One
                  header for both roles; logged-out users see only the search. */}
              {user && (
                <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
                  <NotificationBell />
                  <AccountMenu
                    user={user}
                    isPro={isPro}
                    displayName={displayName}
                    avatarUrl={avatarUrl}
                    initials={initials}
                    proPanelHref={proPanelHref}
                    clientPanelHref={clientPanelHref}
                    sentBookingsHref={sentBookingsHref}
                    sentProjectsHref={sentProjectsHref}
                    savedHref={savedHref}
                    notificationsHref={notificationsHref}
                    accountHref={accountHref}
                    notifUnread={notifUnread}
                    onSignOut={handleSignOut}
                    onOpen={refreshNotifUnread}
                  />
                </div>
              )}
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
            "lg:hidden fixed top-0 left-0 bottom-0 z-[101] w-[84%] max-w-[360px] bg-white shadow-[0_0_40px_rgba(0,0,0,0.25)] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {/* Drawer header — logo (home link) + close */}
          <div className="flex items-center justify-between px-4 h-16 border-b border-gray-100 shrink-0">
            <Link href="/" aria-label="ContrataCR inicio" onClick={() => setMobileOpen(false)}>
              <ContrataCRLogo size="lg" />
            </Link>
            <button
              onClick={() => setMobileOpen(false)}
              aria-label={t("closeMenu")}
              className="p-2 rounded-xl text-[#1a2744] hover:bg-gray-50 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scrollable content — clearly grouped sections; account surfaced first */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {/* Smart search on mobile */}
            <div className="mb-5">
              <CategoryAutocomplete
                placeholder={t("searchServicePlaceholderShort")}
                size="lg"
                onNavigate={() => setMobileOpen(false)}
              />
            </div>

            {/* MI CUENTA — surfaced right after the search so a logged-in user reaches
                their panel fast. Role-aware (pro keeps the unified panel). */}
            {user && (
              <div className="mb-5">
                <div className="flex items-center gap-3 px-2 pb-3 mb-1 border-b border-gray-100">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={avatarUrl ?? undefined} />
                    <AvatarFallback delayMs={avatarUrl ? 600 : 0} className="text-[12px] bg-[#009FD9] text-white font-bold">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    {displayName && <p className="text-sm font-semibold text-[#111827] truncate">{displayName}</p>}
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  </div>
                </div>
                <p className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t("myAccount")}</p>
                <a href={primaryPanelHref} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-semibold text-[#111827] hover:bg-gray-50 transition-colors">
                  <LayoutDashboard className="h-4 w-4 text-[#009FD9] shrink-0" /> {t("myPanel")}
                </a>
                <a href={sentBookingsHref} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm text-[#374151] hover:bg-gray-50 transition-colors">
                  <CalendarDays className="h-4 w-4 text-gray-400 shrink-0" /> {isPro ? t("sentRequests") : t("myRequests")}
                </a>
                <a href={sentProjectsHref} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm text-[#374151] hover:bg-gray-50 transition-colors">
                  <FolderOpen className="h-4 w-4 text-gray-400 shrink-0" /> {isPro ? t("publishedProjects") : t("myProjects")}
                </a>
                <a href={savedHref} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm text-[#374151] hover:bg-gray-50 transition-colors">
                  <Bookmark className="h-4 w-4 text-gray-400 shrink-0" /> {t("favorites")}
                </a>
                <a href={notificationsHref} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm text-[#374151] hover:bg-gray-50 transition-colors">
                  <Bell className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="flex-1">{t("notifications")}</span>
                  {notifUnread > 0 && (
                    <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shrink-0">{notifUnread > 9 ? "9+" : notifUnread}</span>
                  )}
                </a>
                {!isPro && (
                  <Link href="/registro/profesional" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium text-[#009FD9] hover:bg-[#EBF5FB] transition-colors">
                    <Briefcase className="h-4 w-4 shrink-0" /> {t("offerServices")}
                  </Link>
                )}
                <a href={accountHref} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm text-[#374151] hover:bg-gray-50 transition-colors">
                  <Settings className="h-4 w-4 text-gray-400 shrink-0" /> {t("accountSecurity")}
                </a>
              </div>
            )}

            {/* CATEGORÍAS */}
            <div className="mb-5">
              <p className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t("categories")}</p>
              {CATEGORY_COLUMNS.flatMap((col) => col.links).slice(0, 9).map((link) => (
                <button
                  key={link.id}
                  onClick={() => goToCategory(link.id)}
                  className="w-full text-left text-sm text-gray-600 hover:text-[#009FD9] transition-colors leading-tight block px-2 py-2"
                >
                  {getCategoryLabel(link.id, locale)}
                </button>
              ))}
              <Link
                href="/categorias"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-1.5 px-2 py-2 text-sm font-semibold text-[#009FD9]"
              >
                <Compass className="h-4 w-4" /> {t("viewAllCategories")}
              </Link>
            </div>

            {/* CUENTA (logged-OUT) — account actions sit right after browse, clearly
                visible but not first: new clients register when they REQUEST a
                service (no "register as client" here), so only Ingresar (returning)
                + Registrarse como profesional (people who offer services). */}
            {!user && (
              <div className="mb-5">
                <p className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t("account")}</p>
                <div className="flex flex-col gap-2 px-1 pt-1">
                  <Link href={loginHref} onClick={() => setMobileOpen(false)}
                    className="w-full px-4 py-3 rounded-xl text-sm font-semibold text-[#374151] border border-gray-200 hover:bg-gray-50 text-center transition-colors">
                    {t("login")}
                  </Link>
                  <Link href="/registro/profesional" onClick={() => setMobileOpen(false)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-[#009FD9] text-white text-sm font-bold text-center hover:bg-[#0089bb] transition-colors">
                    <UserPlus className="h-4 w-4" />
                    {t("registerPro")}
                  </Link>
                </div>
              </div>
            )}

            {/* RECURSOS */}
            <div className="mb-5">
              <p className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t("resources")}</p>
              {RESOURCES_LINKS.map((link) =>
                link.key === "support" ? (
                  <SupportLink
                    key={link.href}
                    onNavigate={() => setMobileOpen(false)}
                    className="block w-full text-left px-2 py-2 text-sm text-gray-600 hover:text-[#009FD9] transition-colors leading-tight"
                  >
                    {t(`resourceLinks.${link.key}`)}
                  </SupportLink>
                ) : (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="block px-2 py-2 text-sm text-gray-600 hover:text-[#009FD9] transition-colors leading-tight"
                  >
                    {t(`resourceLinks.${link.key}`)}
                  </Link>
                )
              )}
            </div>

            {/* Idioma */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-gray-400 font-medium">{t("language")}</span>
                <LanguageTogglePill />
              </div>
            </div>

            {/* Cerrar sesión — logged-in only, at the very bottom */}
            {user && (
              <div className="mt-4">
                <button onClick={handleSignOut}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-red-600 border border-red-100 hover:bg-red-50 transition-colors">
                  <LogOut className="h-4 w-4" /> {t("signOut")}
                </button>
              </div>
            )}
          </div>
        </div>
    </>
  );
}
