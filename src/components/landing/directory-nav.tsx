"use client";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Store, ChevronDown, ChevronRight, Compass, Users, MoreHorizontal, Menu, Search, type LucideIcon } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useSiteFeatures } from "@/components/site-features";
import { DIRECTORY_SECTION_LABELS, unifiedSearchPlaceholder } from "@/lib/search/directory-search";
import { DIRECTORY_SECTION_ICONS, groupPlaces, curatedGroupItems, pick } from "@/lib/directory/directory-groups";
import { getAllCategories, getAllCategoryGroups, getCategoryLabel, getCategoryGroupLabel } from "@/lib/data/categories";
import { useCustomCategories } from "@/lib/data/use-custom-categories";
import { rutaDeBusqueda } from "@/lib/buscar-url";
import { SearchEntry } from "@/components/directory/search-entry";
import { ContrataCRMark } from "@/components/brand/brand-logo";

// Public navigation to the place directory (2026-11-18): the «Categorías» menu (desktop) and the mobile drawer list the
// sections that are on (useSiteFeatures, from the server flags). Short menu labels; the section page keeps its full name.
export { DIRECTORY_SECTION_ICONS };
const SECTIONS: Record<string, { es: string; en: string; icon: LucideIcon }> = Object.fromEntries(
  Object.entries(DIRECTORY_SECTION_LABELS).map(([section, label]) => [section, { ...label, icon: DIRECTORY_SECTION_ICONS[section] ?? Store }]),
);
function useSections() {
  const { directorySections } = useSiteFeatures();
  return Object.keys(SECTIONS).filter((s) => directorySections.includes(s));
}

export { DIRECTORY_GROUPS } from "@/lib/directory/directory-groups";
const TXT = {
  allCategories: { es: "Ver todas las categorías", en: "See all categories" },
  prices: { es: "Comparar precios", en: "Compare prices" },
  events: { es: "Eventos", en: "Events" },
  places: { es: "Lugares", en: "Places" },
  categories: { es: "Categorías", en: "Categories" },
  options: { es: "{n} opciones", en: "{n} options" },
};
const FOOT_LINK = "inline-flex items-center rounded-xl px-2.5 py-1.5 text-sm font-semibold text-[#1A2744] transition-colors hover:bg-gray-50 hover:text-[#009FD9]";

/** Number of curated place sections inside a group (0 while the directory is off or for groups without places). */
export function usePlaceCount(): (groupId: string) => number {
  const { directorySections } = useSiteFeatures();
  return (groupId) => groupPlaces(groupId, directorySections).length;
}

/** Row class shared by place rows and service rows of the desktop Categorías panel: one look, the user cannot tell them apart. */
export const MENU_ROW_CLASS = "group flex min-h-10 items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold leading-snug text-[#374151] transition-colors hover:bg-[#EBF5FB] hover:text-[#0089bb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/20";

/** The place rows of one group in the desktop panel (children of the same two-column grid as the service rows). */
export function CategoriesPlaceRows({ groupId, locale, onNavigate }: { groupId: string; locale: string; onNavigate: () => void }) {
  const { directorySections } = useSiteFeatures();
  return (
    <>
      {groupPlaces(groupId, directorySections).map(({ section, label }) => (
        <Link key={section} href={`/${section}`} onClick={onNavigate} data-nav-directory-section={section} className={MENU_ROW_CLASS}>
          <span className="min-w-0 [overflow-wrap:anywhere]">{pick(label, locale)}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[#cbd5e1] group-hover:text-[#009FD9]" aria-hidden />
        </Link>
      ))}
    </>
  );
}

/** The themes (service groups with their places merged in), each with the rows shown in menus: places first, then services. */
export type ThemeRow = { key: string; label: string; href: string };
export type Theme = { id: string; label: string; count: number; rows: ThemeRow[] };
export function useThemes(locale: string): Theme[] {
  const { directorySections } = useSiteFeatures();
  useCustomCategories();
  const all = getAllCategories();
  return getAllCategoryGroups().map((g) => {
    const places = groupPlaces(g.id, directorySections);
    const services = all.filter((c) => c.groupId === g.id);
    return {
      id: g.id,
      label: getCategoryGroupLabel(g.id, locale),
      count: services.length + places.length,
      rows: [
        ...places.map(({ section, label }) => ({ key: `p-${section}`, label: pick(label, locale), href: `/${section}` })),
        ...curatedGroupItems(g.id, services, places.length).map((item) => ({ key: item.id, label: getCategoryLabel(item.id, locale), href: rutaDeBusqueda({ categoria: item.id }) })),
      ],
    };
  }).filter((t) => t.rows.length > 0);
}

/** Footer row of the Categorías menu with the directory on. */
export function CategoriesMenuFooter({ locale, onNavigate }: { locale: string; onNavigate: () => void }) {
  return (
    <div className="mt-4 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 pt-3">
      <Link href="/servicios" onClick={onNavigate} className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-bold text-[#009FD9] hover:underline">
        <Compass className="h-4 w-4" aria-hidden />{pick(TXT.allCategories, locale)}
      </Link>
      <Link href="/precios" onClick={onNavigate} data-nav-places-prices className={FOOT_LINK}>{pick(TXT.prices, locale)}</Link>
      <Link href="/eventos" onClick={onNavigate} className={FOOT_LINK}>{pick(TXT.events, locale)}</Link>
    </div>
  );
}

/** Mobile drawer accordion "Categorías" (directory on): the same themes as the desktop menu (each opens its places and most
 * demanded services), then the closing links. */
export function CategoriesDrawerGroup({ locale, itemClass, textClass, icon, onNavigate }: { locale: string; itemClass: string; textClass: string; icon: React.ReactNode; onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const themes = useThemes(locale);
  return (
    <div data-nav-services-drawer>
      <button type="button" aria-expanded={open} aria-controls="ccr-drawer-categorias" onClick={() => setOpen((v) => !v)} className={itemClass}>
        {icon}
        <span className={textClass}>{pick(TXT.categories, locale)}</span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id="ccr-drawer-categorias" className="ccr-menu-sub">
          {themes.map((g) => (
            <div key={g.id}>
              <button type="button" aria-expanded={openGroup === g.id} onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)} className="ccr-menu-sub-fila w-full text-left">
                {g.label}
              </button>
              {openGroup === g.id && (
                <div className="pl-3">
                  {g.rows.map((row) => (
                    <Link key={row.key} href={row.href} prefetch={false} onClick={onNavigate} {...(row.key.startsWith("p-") ? { "data-nav-directory-section": row.key.slice(2) } : {})} className="ccr-menu-sub-fila">{row.label}</Link>
                  ))}
                </div>
              )}
            </div>
          ))}
          <Link href="/servicios" prefetch={true} onClick={onNavigate} className="ccr-menu-sub-fila font-bold text-[#009FD9]">{pick(TXT.allCategories, locale)}</Link>
          <Link href="/precios" prefetch={false} onClick={onNavigate} className="ccr-menu-sub-fila">{pick(TXT.prices, locale)}</Link>
          <Link href="/eventos" prefetch={false} onClick={onNavigate} className="ccr-menu-sub-fila">{pick(TXT.events, locale)}</Link>
        </div>
      )}
    </div>
  );
}

/** Footer column "Categorías": one representative entry per top theme (its first place, else its first service; themes have
 * no page of their own), then all categories and price comparison. Same accordion on phones as the other footer columns.
 * Renders nothing while the directory is off (the flag-off footer has no such column). */
export const FOOTER_THEMES: readonly string[] = ["comercios", "hogar", "salud", "automotriz", "belleza", "turismo", "mascotas", "profesional"];
export function FooterPlacesColumn({ locale, heading, open, onToggle, interactive }: { locale: string; heading: string; open: boolean; onToggle: () => void; interactive: boolean }) {
  const themes = useThemes(locale);
  const { directorySections } = useSiteFeatures();
  const entries = FOOTER_THEMES.map((id) => themes.find((t) => t.id === id)?.rows[0]).filter((r): r is ThemeRow => !!r);
  if (!directorySections.length || !entries.length) return null;
  const linkClass = "inline-flex py-2 text-sm leading-5 text-[#162543] hover:text-[#0083b0] transition-colors";
  return (
    <nav data-footer-places aria-label={heading} className="border-b border-[#162543]/10 md:border-0">
      <h3 className="text-[15px] font-semibold text-[#162543] md:mb-3 md:text-sm md:font-bold">
        <span className="hidden md:inline">{heading}</span>
        <button type="button" disabled={!interactive} aria-expanded={open} aria-controls="footer-places" onClick={onToggle} className="flex min-h-16 w-full items-center justify-between gap-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009fd9] md:hidden">
          {heading}
          <ChevronDown aria-hidden="true" className={cn("h-[18px] w-[18px] shrink-0 text-[#64748b] transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
        </button>
      </h3>
      <ul id="footer-places" className={cn(open ? "grid" : "hidden", "grid-cols-1 gap-y-1 pb-5 md:grid md:pb-0")}>
        {entries.map((row) => (
          <li key={row.key}>
            <Link href={row.href} className={linkClass}>{row.label}</Link>
          </li>
        ))}
        <li><Link href="/servicios" className={linkClass}>{pick(TXT.allCategories, locale)}</Link></li>
        <li><Link href="/precios" className={linkClass}>{pick(TXT.prices, locale)}</Link></li>
      </ul>
    </nav>
  );
}

/** Home page band «Lugares y negocios» (2026-11-18): grid of the sections that are on, with links to price comparison and
 * events. Server-rendered from the same flags as the menu (no layout shift); renders nothing while the directory is off. */
export function DirectoryHomeSection({ locale }: { locale: string }) {
  const sections = useSections(), en = locale === "en";
  if (!sections.length) return null;
  return (
    <section data-home-directory aria-labelledby="ccr-home-directorio" className="bg-white py-10 sm:py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 text-center sm:mb-8">
          <h2 id="ccr-home-directorio" className="text-2xl font-extrabold text-[#1a2744] sm:text-3xl">{en ? "Places and businesses" : "Lugares y negocios"}</h2>
          <p className="mx-auto mt-2 max-w-2xl text-[15px] text-[#5b6b82] sm:text-base">
            {en ? "Find restaurants, shops and services across Costa Rica: hours, photos, reviews and contact details." : "Encuentre restaurantes, comercios y servicios en todo Costa Rica: horarios, fotos, reseñas y datos de contacto."}
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
          {sections.map((s) => {
            const { icon: Icon } = SECTIONS[s];
            return (
              <li key={s}>
                <Link href={`/${s}`} data-home-directory-section={s} className="flex min-h-14 items-center gap-2.5 rounded-2xl border border-[#e5e9ee] bg-white px-3 py-3 text-sm sm:gap-3 sm:px-3.5 sm:text-[15px] font-semibold text-[#1A2744] shadow-sm transition-colors hover:border-[#009FD9] hover:text-[#009FD9]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#eaf7fd] sm:h-9 sm:w-9 text-[#009FD9]"><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
                  <span className="min-w-0 leading-tight">{en ? SECTIONS[s].en : SECTIONS[s].es}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/precios" className="inline-flex min-h-11 items-center rounded-full border border-[#1A2744] px-5 text-sm font-bold text-[#1A2744] transition-colors hover:bg-[#1A2744] hover:text-white">{en ? "Compare prices" : "Comparar precios"}</Link>
          <Link href="/eventos" className="inline-flex min-h-11 items-center rounded-full border border-[#1A2744] px-5 text-sm font-bold text-[#1A2744] transition-colors hover:bg-[#1A2744] hover:text-white">{en ? "Events" : "Eventos"}</Link>
        </div>
      </div>
    </section>
  );
}

/** Second row under the main bar (Yelp style): quick links to the most used directory sections, "Profesionales" and "Más"
 * (all categories). In flow (not fixed), so it never changes the navbar height other layouts measure. Renders nothing while
 * the directory is off. On phones the five links are equal columns, icon above label. */
// Owner, 2026-11-26: the most important ones only, like Yelp (Profesionales, Restaurantes, Gasolineras, Farmacias, Más).
export const QUICK_NAV_SECTIONS: readonly string[] = ["restaurantes", "gasolineras", "farmacias"];
/** `spacer`: also reserve the fixed navbar height first (pages whose first block starts under the bar, like the home). */
export function DirectoryQuickNav({ className, spacer }: { className?: string; spacer?: boolean }) {
  const { directorySections } = useSiteFeatures();
  const pathname = usePathname() ?? "/";
  const locale = useLocale();
  const t = useTranslations("quickNav");
  const sections = QUICK_NAV_SECTIONS.filter((s) => directorySections.includes(s) && SECTIONS[s]);
  const navRef = useRef<HTMLElement>(null);
  const [searching, setSearching] = useState(false);
  if (!sections.length) return null;
  const place = (s: string) => ({ key: s, href: `/${s}`, label: pick(SECTIONS[s], locale), icon: SECTIONS[s].icon, active: pathname === `/${s}` });
  const pros = { key: "pros", href: "/profesionales", label: t("professionals"), icon: Users, active: pathname === "/profesionales" };
  const items: { key: string; href: string; label: string; icon: LucideIcon; active: boolean }[] = [
    pros, ...sections.map(place),
    { key: "more", href: "/servicios", label: t("more"), icon: MoreHorizontal, active: pathname === "/servicios" || pathname === "/lugares" },
  ];
  return (
    <>
    {/* Phones (owner, 2026-11-26): this IS the header, compact like Airbnb/Booking — the ContrataCR symbol, one search bar and
        ☰ on the first row, the sections below. The navbar's own phone row hides while this one shows (body.ccr-dir-header). */}
    <PhoneHeaderFlag navRef={navRef} />
    {spacer && <div className="hidden h-16 lg:block" aria-hidden />}
    <nav ref={navRef} data-quick-nav aria-label={t("label")} className={cn("bg-white max-lg:sticky max-lg:top-0 max-lg:z-[60] max-lg:pt-[env(safe-area-inset-top)] max-lg:flex max-lg:flex-col max-lg:shadow-[0_6px_12px_-10px_rgba(22,37,67,0.35)] lg:border-b lg:border-[#162543]/10", className)}>
      <ul className="mx-auto grid w-full max-w-[1920px] grid-cols-5 px-1 pb-1.5 sm:flex sm:items-center sm:gap-0.5 sm:px-6 sm:py-1.5 lg:px-8">
        {items.map(({ key, href, label, icon: Icon, active }) => (
          <li key={key} className="min-w-0 sm:shrink-0">
            <Link
              href={href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              data-quick-nav-link={key}
              className={cn(
                "flex flex-col items-center justify-start gap-1 rounded-xl px-0.5 py-1 text-center text-[11px] leading-tight transition-colors sm:inline-flex sm:h-9 sm:flex-row sm:justify-center sm:py-0 sm:gap-1.5 sm:whitespace-nowrap sm:rounded-full sm:px-2.5 sm:text-[13px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#009FD9]",
                active ? "font-bold text-[#0083b0] sm:bg-[#eaf7fd]" : "font-semibold text-[#162543] sm:hover:bg-[#f3f6f9] hover:text-[#0083b0]",
              )}
            >
              <span className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] sm:h-auto sm:w-auto sm:rounded-none sm:bg-transparent", active ? "bg-[#009FD9] text-white sm:text-current" : "bg-[#eef3f7] text-[#162543] sm:text-current")}><Icon className="h-5 w-5 sm:h-4 sm:w-4" strokeWidth={1.85} aria-hidden /></span><span className="max-w-full truncate">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="order-first flex items-center gap-2 px-3 pb-1.5 pt-2 lg:hidden">
        <Link href="/" aria-label="ContrataCR" prefetch={false} className="shrink-0"><ContrataCRMark /></Link>
        <button type="button" data-quick-nav-search onClick={() => setSearching(true)}
          className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-[#d7e1ea] bg-white pl-1 pr-3 text-left shadow-[0_6px_18px_-10px_rgba(22,37,67,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#009FD9]">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#009FD9] text-white"><Search className="h-[17px] w-[17px]" aria-hidden /></span>
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[#5b6b82]">{unifiedSearchPlaceholder(locale, true)}</span>
        </button>
        <button type="button" data-quick-nav-menu onClick={() => window.dispatchEvent(new Event("ccr:open-mobile-menu"))} aria-label={t("menu")}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#162543] hover:bg-gray-50 active:scale-95"><Menu className="h-5 w-5 stroke-[2.5]" aria-hidden /></button>
      </div>
    </nav>
    {/* The Yelp-style search screen: location, recent searches, trending and live suggestions. */}
    {searching && <SearchEntry onClose={() => setSearching(false)} />}
    </>
  );
}

/** While the directory header is SHOWN on a phone, the navbar's own row (logo, account) steps aside so the page has one
 * header. Checked on mount and on resize: pages that keep this row desktop-only (Categorías) keep their navbar. */
function PhoneHeaderFlag({ navRef }: { navRef: React.RefObject<HTMLElement | null> }) {
  useEffect(() => {
    const sync = () => document.body.classList.toggle("ccr-dir-header", window.innerWidth < 1024 && !!navRef.current?.getClientRects().length);
    sync();
    window.addEventListener("resize", sync);
    return () => { window.removeEventListener("resize", sync); document.body.classList.remove("ccr-dir-header"); };
  }, [navRef]);
  return null;
}
