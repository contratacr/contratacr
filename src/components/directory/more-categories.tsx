"use client";
import { useEffect } from "react";
import { useLocale } from "next-intl";
import { ArrowLeft, Briefcase, ChevronRight, FileText, Megaphone, Users, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useSiteFeatures } from "@/components/site-features";
import { enabledDirectoryGroups, pick, type Bilingual } from "@/lib/directory/directory-groups";
import { rutaDeBusqueda } from "@/lib/buscar-url";
import { categoryIcon, sectionIcon, serviceGroupIcon } from "@/lib/visuals/section-visuals";
import { IconBadge } from "@/lib/visuals/section-icon";

/**
 * "Más categorías" (Yelp "More Categories" model, our own colours and icons). ONE component for the sheet opened by the
 * "Más" tile of the home and for /categorias. Every row links to a route that already exists: a place section
 * (/restaurantes...), a filter of that section (/cafes?kind=bar) or the professional search of a service of the
 * catalogue. Groups come from this list plus lib/directory/directory-groups.ts (sections already shown are not repeated).
 */
type Row = { key: string; label: Bilingual; icon: LucideIcon; href: string; section?: string };
type Group = { id: string; label: Bilingual; rows: Row[] };

// Icons come from the single visuals module: a service shows its group's icon, a place row its section/variant icon.
const service = (key: string, es: string, en: string, categoria: string): Row => ({ key, label: { es, en }, icon: categoryIcon(categoria), href: rutaDeBusqueda({ categoria }) });
const place = (key: string, es: string, en: string, visual: string, href: string, section?: string): Row => ({ key, label: { es, en }, icon: sectionIcon(visual), href, section });

const CURATED: Group[] = [
  { id: "populares", label: { es: "Populares", en: "Popular" }, rows: [
    service("contadores", "Contadores", "Accountants", "contabilidad"),
    { key: "hogar", label: { es: "Mantenimiento del hogar", en: "Home maintenance" }, icon: serviceGroupIcon("hogar"), href: "/buscar?grupo=hogar" },
    service("electricistas", "Electricistas", "Electricians", "electricidad"),
  ] },
  { id: "snacks", label: { es: "Snacks y bebidas", en: "Snacks and drinks" }, rows: [
    place("cafe", "Café y té", "Coffee and tea", "cafes:cafeterias", "/cafes?kind=cafe,coffee_shop", "cafes"),
    place("bares", "Bares", "Bars", "cafes:bares", "/cafes?kind=bar,pub", "cafes"),
    place("postres", "Postres", "Desserts", "cafes:postres", "/cafes?kind=bakery,ice_cream", "cafes"),
  ] },
  { id: "spas", label: { es: "Spas y salones", en: "Spas and salons" }, rows: [
    service("peluquerias", "Peluquerías", "Hair salons", "peluqueria"),
    service("masajes", "Masajes", "Massage", "masajes"),
    service("spas", "Spas", "Spas", "spa"),
  ] },
  { id: "autos", label: { es: "Servicios automotrices", en: "Auto services" }, rows: [
    place("lavacar", "Lavacar", "Car washes", "lavacar", "/lavacar", "lavacar"),
    place("taller", "Taller mecánico", "Auto repair", "talleres", "/talleres", "talleres"),
    place("gasolineras", "Gasolineras", "Fuel stations", "gasolineras", "/gasolineras", "gasolineras"),
    place("parqueos", "Parqueos", "Parking", "parqueos", "/parqueos", "parqueos"),
  ] },
  // Owner 2026-11-26: hotels and houses/apartments by the day, one tap away (kind filters of /hospedaje).
  { id: "hospedaje", label: { es: "Dónde quedarse", en: "Places to stay" }, rows: [
    place("hoteles", "Hoteles", "Hotels", "hospedaje:hoteles", "/hospedaje?kind=hotel", "hospedaje"),
    place("por-dias", "Casas y apartamentos por días", "Vacation rentals", "hospedaje:por-dias", "/hospedaje?kind=vacation_rental", "hospedaje"),
  ] },
];

const MORE_IN_APP: Group = { id: "mas", label: { es: "Más en ContrataCR", en: "More on ContrataCR" }, rows: [
  { key: "profesionales", label: { es: "Servicios", en: "Services" }, icon: Users, href: "/profesionales" },
  { key: "empleos", label: { es: "Empleos", en: "Jobs" }, icon: Briefcase, href: "/empleos" },
  { key: "promociones", label: { es: "Promociones", en: "Promotions" }, icon: Megaphone, href: "/promociones" },
  { key: "solicitudes", label: { es: "Solicitudes", en: "Requests" }, icon: FileText, href: "/solicitudes" },
] };

export function MoreCategories({ variant, onClose }: { variant: "page" | "sheet"; onClose?: () => void }) {
  const locale = useLocale();
  const en = locale === "en";
  const t = (es: string, english: string) => (en ? english : es);
  const { directorySections } = useSiteFeatures();
  const enabled = directorySections as readonly string[];

  useEffect(() => {
    if (variant !== "sheet") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previous; };
  }, [variant, onClose]);

  // A place row of the curated groups only exists when its section is on; services always exist.
  const curated = CURATED.map((g) => ({ ...g, rows: g.rows.filter((r) => !r.section || enabled.includes(r.section)) })).filter((g) => g.rows.length > 0);
  const used = new Set(CURATED.flatMap((g) => g.rows.flatMap((r) => (r.section && r.href === `/${r.section}` ? [r.section] : []))));
  const own: Group[] = enabledDirectoryGroups(enabled)
    .map((g) => ({
      id: `own-${g.id}`,
      label: g.label,
      rows: g.sections.filter((s) => !used.has(s.section)).map((s): Row => ({ key: s.section, label: s.label, icon: sectionIcon(s.section), href: `/${s.section}` })),
    }))
    .filter((g) => g.rows.length > 0);
  const groups = [...curated, ...own, MORE_IN_APP];

  const body = (
    <div data-more-categories className="flex min-h-full flex-col bg-[#f4f7fa] text-[#162543]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#e5e9ee] bg-white px-4 py-3">
        {variant === "sheet" ? (
          <button type="button" onClick={onClose} aria-label={t("Volver", "Back")} data-more-back className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d7e1ea] bg-white text-[#162543] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#009FD9]">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </button>
        ) : (
          <Link href="/" aria-label={t("Volver", "Back")} data-more-back className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d7e1ea] bg-white text-[#162543] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#009FD9]">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
        )}
        <h1 className="text-[19px] font-extrabold leading-6">{t("Más categorías", "More categories")}</h1>
      </header>
      <div className="mx-auto w-full max-w-xl flex-1 space-y-5 px-4 pb-28 pt-4">
        {groups.map((g) => (
          <section key={g.id} aria-labelledby={`more-${g.id}`} data-more-group={g.id}>
            <h2 id={`more-${g.id}`} className="mb-2 px-1 text-[13px] font-extrabold uppercase tracking-wide text-[#5b6b82]">{pick(g.label, locale)}</h2>
            <ul className="overflow-hidden rounded-2xl border border-[#e5e9ee] bg-white">
              {g.rows.map((r) => {
                return (
                  <li key={r.key} className="border-b border-[#eef2f6] last:border-b-0">
                    <Link href={r.href} onClick={onClose} data-more-row={r.key} className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-[15px] font-semibold hover:bg-[#EBF5FB] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#009FD9]">
                      <IconBadge icon={r.icon} size="md" />
                      <span className="min-w-0 flex-1">{pick(r.label, locale)}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[#b6c2d1]" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );

  if (variant === "page") return <main>{body}</main>;
  return <div role="dialog" aria-modal="true" aria-label={t("Más categorías", "More categories")} data-more-sheet className="fixed inset-0 z-[90] overflow-y-auto overscroll-contain bg-[#f4f7fa]">{body}</div>;
}
