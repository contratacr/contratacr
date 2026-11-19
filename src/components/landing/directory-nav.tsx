"use client";
import { useState } from "react";
import { Utensils, Coffee, Fuel, Pill, ShoppingCart, Store, Hammer, BedDouble, Stethoscope, PawPrint, Wrench, Scissors, Dumbbell, Compass, Landmark, ChevronDown, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useSiteFeatures } from "@/components/site-features";

// Public navigation to the place directory (2026-11-18): the «Explorar» menu (desktop) and the mobile drawer list the
// sections that are on (useSiteFeatures, from the server flags). Short menu labels; the section page keeps its full name.
const SECTIONS: Record<string, { es: string; en: string; icon: LucideIcon }> = {
  restaurantes: { es: "Restaurantes", en: "Restaurants", icon: Utensils },
  cafes: { es: "Cafés y bares", en: "Cafés and bars", icon: Coffee },
  supermercados: { es: "Supermercados", en: "Supermarkets", icon: ShoppingCart },
  pulperias: { es: "Pulperías", en: "Corner stores", icon: Store },
  farmacias: { es: "Farmacias", en: "Pharmacies", icon: Pill },
  ferreterias: { es: "Ferreterías", en: "Hardware stores", icon: Hammer },
  gasolineras: { es: "Gasolineras", en: "Fuel stations", icon: Fuel },
  talleres: { es: "Talleres", en: "Auto repair", icon: Wrench },
  hospedaje: { es: "Hospedaje", en: "Lodging", icon: BedDouble },
  tours: { es: "Tours", en: "Tours", icon: Compass },
  belleza: { es: "Belleza", en: "Beauty", icon: Scissors },
  gimnasios: { es: "Gimnasios", en: "Gyms", icon: Dumbbell },
  veterinarias: { es: "Veterinarias", en: "Vets and pets", icon: PawPrint },
  salud: { es: "Salud", en: "Health", icon: Stethoscope },
  bancos: { es: "Bancos y cajeros", en: "Banks and ATMs", icon: Landmark },
};
function useSections() {
  const { directorySections } = useSiteFeatures();
  return Object.keys(SECTIONS).filter((s) => directorySections.includes(s));
}

/** Second block of the desktop «Explorar» menu. Renders nothing while the directory is off. */
export function DirectoryExploreMenu({ locale, onNavigate }: { locale: string; onNavigate: () => void }) {
  const sections = useSections(), en = locale === "en";
  if (!sections.length) return null;
  return (
    <div data-nav-directory className="mt-2 border-t border-gray-100 pt-3">
      <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-[#5b6b82]">{en ? "Places and businesses" : "Lugares y negocios"}</p>
      <ul className="grid grid-cols-2 gap-x-1">
        {sections.map((s) => {
          const { icon: Icon } = SECTIONS[s];
          return (
            <li key={s}>
              <Link href={`/${s}`} onClick={onNavigate} data-nav-directory-section={s} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-[#1A2744] transition-colors hover:bg-gray-50 hover:text-[#009FD9]">
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {en ? SECTIONS[s].en : SECTIONS[s].es}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Mobile drawer row «Lugares y negocios» that expands into the section list. Renders nothing while off. */
export function DirectoryDrawerGroup({ locale, itemClass, textClass, icon, onNavigate }: { locale: string; itemClass: string; textClass: string; icon: React.ReactNode; onNavigate: () => void }) {
  const sections = useSections(), en = locale === "en";
  const [open, setOpen] = useState(false);
  if (!sections.length) return null;
  return (
    <div data-nav-directory-drawer>
      <button type="button" aria-expanded={open} aria-controls="ccr-drawer-directorio" onClick={() => setOpen((v) => !v)} className={itemClass}>
        {icon}
        <span className={textClass}>{en ? "Places and businesses" : "Lugares y negocios"}</span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul id="ccr-drawer-directorio" className="grid grid-cols-2 gap-x-2 border-b border-[#e5e9ee] py-2">
          {sections.map((s) => {
            const { icon: Icon } = SECTIONS[s];
            return (
              <li key={s}>
                <Link href={`/${s}`} onClick={onNavigate} data-nav-directory-section={s} className="flex min-h-11 items-center gap-2.5 rounded-xl px-2 text-[15px] font-semibold text-[#162543] transition-colors hover:text-[#009FD9]">
                  <Icon className="h-[18px] w-[18px] shrink-0 text-[#5b6b82]" aria-hidden />
                  <span className="min-w-0 break-words">{en ? SECTIONS[s].en : SECTIONS[s].es}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
