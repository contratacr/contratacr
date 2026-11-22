"use client";
import { useState } from "react";
import { Store, ChevronDown, ChevronRight, Compass, MapPin, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useSiteFeatures } from "@/components/site-features";
import { DIRECTORY_SECTION_LABELS } from "@/lib/search/directory-search";
import { DIRECTORY_SECTION_ICONS, curatedPlaces, curatedGroupItems, pick } from "@/lib/directory/directory-groups";
import { getAllCategories, getAllCategoryGroups, getCategoryLabel, getCategoryGroupLabel } from "@/lib/data/categories";
import { useCustomCategories } from "@/lib/data/use-custom-categories";
import { rutaDeBusqueda } from "@/lib/buscar-url";

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
function usePlaces() {
  const { directorySections } = useSiteFeatures();
  return curatedPlaces(directorySections);
}
const TXT = {
  allPlaces: { es: "Ver todos los lugares", en: "See all places" },
  allCategories: { es: "Ver todas las categorías", en: "See all categories" },
  prices: { es: "Comparar precios", en: "Compare prices" },
  events: { es: "Eventos", en: "Events" },
  places: { es: "Lugares", en: "Places" },
  categories: { es: "Categorías", en: "Categories" },
  options: { es: "{n} opciones", en: "{n} options" },
};
const FOOT_LINK = "inline-flex items-center rounded-xl px-2.5 py-1.5 text-sm font-semibold text-[#1A2744] transition-colors hover:bg-gray-50 hover:text-[#009FD9]";

/** Id of the "Lugares" entry inside the Categorías left list (it can never clash with a service group id). */
export const PLACES_GROUP_ID = "__lugares";

/** Left-list entry "Lugares" of the desktop Categorías menu, same look as a service group row. Renders nothing while the
 * directory is off. A thin divider and small title separate it from the service groups. */
export function CategoriesPlacesEntry({ locale, selected, onSelect }: { locale: string; selected: boolean; onSelect: () => void }) {
  const places = usePlaces();
  if (!places.length) return null;
  return (
    <div data-nav-places-entry className="mt-1.5 border-t border-[#eef2f6] pt-1.5">
      <button
        type="button"
        onClick={onSelect}
        onMouseEnter={onSelect}
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/20",
          selected ? "bg-white text-[#162543] shadow-sm" : "text-[#526173] hover:bg-white/80 hover:text-[#162543]",
        )}
      >
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", selected ? "bg-[#EAF7FD] text-[#0089bb]" : "bg-white text-[#8a94a6] group-hover:text-[#0089bb]")}>
          <MapPin className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold leading-snug">{pick(TXT.places, locale)}</span>
          <span className="mt-0.5 block text-[11px] font-medium text-[#68778d]">{pick(TXT.options, locale).replace("{n}", String(places.length))}</span>
        </span>
        <ChevronRight className={cn("h-4 w-4 shrink-0", selected ? "text-[#009FD9]" : "text-[#cbd5e1]")} aria-hidden />
      </button>
    </div>
  );
}

/** Right panel of the Categorías menu for "Lugares": the curated place categories (icon + label, two columns). */
export function CategoriesPlacesPanel({ locale, onNavigate }: { locale: string; onNavigate: () => void }) {
  const places = usePlaces();
  if (!places.length) return null;
  return (
    <section data-nav-places aria-label={pick(TXT.places, locale)}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#8a94a6]">{pick(TXT.categories, locale)}</p>
          <h3 className="mt-0.5 truncate text-lg font-extrabold text-[#162543]">{pick(TXT.places, locale)}</h3>
        </div>
        <Link href="/lugares" onClick={onNavigate} data-nav-places-all className="shrink-0 text-xs font-bold text-[#009FD9] hover:underline">{pick(TXT.allPlaces, locale)}</Link>
      </div>
      <ul className="grid grid-cols-2 gap-1.5">
        {places.map(({ section, label }) => {
          const Icon = DIRECTORY_SECTION_ICONS[section] ?? Store;
          return (
            <li key={section}>
              <Link href={`/${section}`} onClick={onNavigate} data-nav-directory-section={section} className="group flex min-h-10 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold leading-snug text-[#374151] transition-colors hover:bg-[#EBF5FB] hover:text-[#0089bb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/20">
                <Icon className="h-4 w-4 shrink-0 text-[#8a94a6] group-hover:text-[#0089bb]" aria-hidden />
                <span className="min-w-0 [overflow-wrap:anywhere]">{pick(label, locale)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Footer row of the Categorías menu with the directory on. */
export function CategoriesMenuFooter({ locale, onNavigate }: { locale: string; onNavigate: () => void }) {
  return (
    <div className="mt-4 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 pt-3">
      <Link href="/servicios" onClick={onNavigate} className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-bold text-[#009FD9] hover:underline">
        <Compass className="h-4 w-4" aria-hidden />{pick(TXT.allCategories, locale)}
      </Link>
      <Link href="/lugares" onClick={onNavigate} data-nav-places-all className={FOOT_LINK}>{pick(TXT.allPlaces, locale)}</Link>
      <Link href="/precios" onClick={onNavigate} data-nav-places-prices className={FOOT_LINK}>{pick(TXT.prices, locale)}</Link>
      <Link href="/eventos" onClick={onNavigate} className={FOOT_LINK}>{pick(TXT.events, locale)}</Link>
    </div>
  );
}

/** Mobile drawer accordion "Categorías" (directory on): the service groups (each opens its most demanded services), then a
 * "Lugares" block with the curated place categories and the closing links. */
export function CategoriesDrawerGroup({ locale, itemClass, textClass, icon, onNavigate }: { locale: string; itemClass: string; textClass: string; icon: React.ReactNode; onNavigate: () => void }) {
  const places = usePlaces();
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  useCustomCategories();
  const all = getAllCategories();
  const groups = getAllCategoryGroups().map((g) => ({ ...g, items: curatedGroupItems(g.id, all.filter((c) => c.groupId === g.id)) })).filter((g) => g.items.length > 0);
  return (
    <div data-nav-services-drawer>
      <button type="button" aria-expanded={open} aria-controls="ccr-drawer-categorias" onClick={() => setOpen((v) => !v)} className={itemClass}>
        {icon}
        <span className={textClass}>{pick(TXT.categories, locale)}</span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id="ccr-drawer-categorias" className="ccr-menu-sub">
          {groups.map((g) => (
            <div key={g.id}>
              <button type="button" aria-expanded={openGroup === g.id} onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)} className="ccr-menu-sub-fila w-full text-left">
                {getCategoryGroupLabel(g.id, locale)}
              </button>
              {openGroup === g.id && (
                <div className="pl-3">
                  {g.items.map((item) => (
                    <Link key={item.id} href={rutaDeBusqueda({ categoria: item.id })} prefetch={false} onClick={onNavigate} className="ccr-menu-sub-fila">{getCategoryLabel(item.id, locale)}</Link>
                  ))}
                </div>
              )}
            </div>
          ))}
          <Link href="/servicios" prefetch={true} onClick={onNavigate} className="ccr-menu-sub-fila font-bold text-[#009FD9]">{pick(TXT.allCategories, locale)}</Link>
          {places.length > 0 && (
            <div data-nav-directory-drawer className="mt-2">
              <p className="pt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#7a899d]">{pick(TXT.places, locale)}</p>
              {places.map(({ section, label }) => (
                <Link key={section} href={`/${section}`} prefetch={false} onClick={onNavigate} data-nav-directory-section={section} className="ccr-menu-sub-fila">{pick(label, locale)}</Link>
              ))}
              <Link href="/lugares" prefetch={false} onClick={onNavigate} className="ccr-menu-sub-fila font-bold text-[#009FD9]">{pick(TXT.allPlaces, locale)}</Link>
              <Link href="/precios" prefetch={false} onClick={onNavigate} className="ccr-menu-sub-fila">{pick(TXT.prices, locale)}</Link>
              <Link href="/eventos" prefetch={false} onClick={onNavigate} className="ccr-menu-sub-fila">{pick(TXT.events, locale)}</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Footer column "Lugares": the curated place categories + price comparison + all places. Same accordion on phones as the
 * other footer columns. Renders nothing while the directory is off. */
export function FooterPlacesColumn({ locale, heading, open, onToggle, interactive }: { locale: string; heading: string; open: boolean; onToggle: () => void; interactive: boolean }) {
  const places = usePlaces();
  if (!places.length) return null;
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
        {places.map(({ section, label }) => (
          <li key={section}>
            <Link href={`/${section}`} className={linkClass}>{pick(label, locale)}</Link>
          </li>
        ))}
        <li><Link href="/precios" className={linkClass}>{pick(TXT.prices, locale)}</Link></li>
        <li><Link href="/lugares" className={linkClass}>{pick(TXT.allPlaces, locale)}</Link></li>
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
