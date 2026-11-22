"use client";
import { useState } from "react";
import { Store, ChevronDown, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useSiteFeatures } from "@/components/site-features";
import { DIRECTORY_SECTION_LABELS } from "@/lib/search/directory-search";
import { DIRECTORY_SECTION_ICONS, enabledDirectoryGroups, pick } from "@/lib/directory/directory-groups";

// Public navigation to the place directory (2026-11-18): the «Explorar» menu (desktop) and the mobile drawer list the
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
function useGroups() {
  const { directorySections } = useSiteFeatures();
  return enabledDirectoryGroups(directorySections);
}
const TXT = {
  allPlaces: { es: "Ver todos los lugares", en: "See all places" },
  prices: { es: "Comparar precios", en: "Compare prices" },
  events: { es: "Eventos", en: "Events" },
  places: { es: "Lugares", en: "Places" },
};
const MENU_LINK = "flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-sm font-semibold text-[#1A2744] transition-colors hover:bg-gray-50 hover:text-[#009FD9]";

/** Desktop "Lugares" menu: six groups with their sections and a footer row. Renders nothing while the directory is off. */
export function PlacesMenuPanel({ locale, onNavigate }: { locale: string; onNavigate: () => void }) {
  const groups = useGroups();
  if (!groups.length) return null;
  return (
    <div data-nav-places className="w-[760px] max-w-[calc(100vw-2rem)]">
      <div className="grid grid-cols-3 gap-x-4 gap-y-5">
        {groups.map((g) => {
          const GroupIcon = g.icon;
          return (
            <section key={g.id} data-nav-places-group={g.id} aria-label={pick(g.label, locale)}>
              <h3 className="mb-1 flex items-center gap-2 px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#7a899d]">
                <GroupIcon className="h-3.5 w-3.5" aria-hidden />
                {pick(g.label, locale)}
              </h3>
              <ul>
                {g.sections.map(({ section, label }) => {
                  const { icon: Icon } = SECTIONS[section];
                  return (
                    <li key={section}>
                      <Link href={`/${section}`} onClick={onNavigate} data-nav-directory-section={section} className={MENU_LINK}>
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                        {pick(label, locale)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-gray-100 pt-3">
        <Link href="/precios" onClick={onNavigate} data-nav-places-prices className="inline-flex items-center rounded-xl px-2.5 py-1.5 text-sm font-semibold text-[#1A2744] transition-colors hover:bg-gray-50 hover:text-[#009FD9]">{pick(TXT.prices, locale)}</Link>
        <Link href="/eventos" onClick={onNavigate} className="inline-flex items-center rounded-xl px-2.5 py-1.5 text-sm font-semibold text-[#1A2744] transition-colors hover:bg-gray-50 hover:text-[#009FD9]">{pick(TXT.events, locale)}</Link>
        <Link href="/lugares" onClick={onNavigate} data-nav-places-all className="ml-auto inline-flex items-center rounded-xl px-2.5 py-1.5 text-sm font-bold text-[#009FD9] hover:underline">{pick(TXT.allPlaces, locale)}</Link>
      </div>
    </div>
  );
}

/** Mobile drawer accordion "Lugares": the groups with their sections. Renders nothing while the directory is off. */
export function DirectoryDrawerGroup({ locale, itemClass, textClass, icon, onNavigate }: { locale: string; itemClass: string; textClass: string; icon: React.ReactNode; onNavigate: () => void }) {
  const groups = useGroups();
  const [open, setOpen] = useState(false);
  if (!groups.length) return null;
  return (
    <div data-nav-directory-drawer>
      <button type="button" aria-expanded={open} aria-controls="ccr-drawer-directorio" onClick={() => setOpen((v) => !v)} className={itemClass}>
        {icon}
        <span className={textClass}>{pick(TXT.places, locale)}</span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id="ccr-drawer-directorio" className="space-y-3 border-b border-[#e5e9ee] py-3">
          {groups.map((g) => (
            <section key={g.id} data-nav-places-group={g.id} aria-label={pick(g.label, locale)}>
              <h3 className="px-2 pb-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#7a899d]">{pick(g.label, locale)}</h3>
              <ul className="grid grid-cols-2 gap-x-2">
                {g.sections.map(({ section, label }) => {
                  const { icon: Icon } = SECTIONS[section];
                  return (
                    <li key={section}>
                      <Link href={`/${section}`} onClick={onNavigate} data-nav-directory-section={section} className="flex min-h-11 items-center gap-2.5 rounded-xl px-2 text-[15px] font-semibold text-[#162543] transition-colors hover:text-[#009FD9]">
                        <Icon className="h-[18px] w-[18px] shrink-0 text-[#5b6b82]" aria-hidden />
                        <span className="min-w-0 break-words">{pick(label, locale)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <div className="flex flex-wrap gap-x-5 px-2">
            <Link href="/precios" onClick={onNavigate} className="flex min-h-11 items-center text-[15px] font-semibold text-[#162543] hover:text-[#009FD9]">{pick(TXT.prices, locale)}</Link>
            <Link href="/eventos" onClick={onNavigate} className="flex min-h-11 items-center text-[15px] font-semibold text-[#162543] hover:text-[#009FD9]">{pick(TXT.events, locale)}</Link>
            <Link href="/lugares" onClick={onNavigate} className="flex min-h-11 items-center text-[15px] font-bold text-[#009FD9]">{pick(TXT.allPlaces, locale)}</Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** Footer column "Lugares": one main link per group + price comparison + all places. Same accordion on phones as the
 * other footer columns. Renders nothing while the directory is off. */
export function FooterPlacesColumn({ locale, heading, open, onToggle, interactive }: { locale: string; heading: string; open: boolean; onToggle: () => void; interactive: boolean }) {
  const groups = useGroups();
  if (!groups.length) return null;
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
        {groups.map((g) => (
          <li key={g.id}>
            <Link href={`/${g.sections[0].section}`} className={linkClass}>{pick(g.sections[0].label, locale)}</Link>
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
