import { Utensils, Coffee, Fuel, Pill, ShoppingCart, Store, Hammer, BedDouble, Stethoscope, PawPrint, Wrench, Scissors, Dumbbell, Compass, HeartPulse, Car, Plane, Landmark, SquareParking, Droplets, type LucideIcon } from "lucide-react";
import { DIRECTORY_SECTION_LABELS } from "@/lib/search/directory-search";
import { idiomaDe } from "@/lib/prefijo-de-idioma";

// Information architecture of the place directory (owner decision 2026-11-21, "Lugares"): the sections are shown in six
// groups in the navbar menu, the mobile drawer, the footer and the /lugares hub. ONE list for all of them. A section that
// is not enabled (useSiteFeatures().directorySections / sitemapSections()) is filtered out and an empty group is hidden.
// Plain module (no "use client") so server pages (the hub) and client menus can both import it.
/** Icon of each section (menus, hub, suggestions). */
export const DIRECTORY_SECTION_ICONS: Record<string, LucideIcon> = {
  restaurantes: Utensils, cafes: Coffee, supermercados: ShoppingCart, pulperias: Store, farmacias: Pill, ferreterias: Hammer,
  gasolineras: Fuel, talleres: Wrench, hospedaje: BedDouble, tours: Compass, belleza: Scissors, gimnasios: Dumbbell,
  veterinarias: PawPrint, salud: Stethoscope, bancos: Landmark, parqueos: SquareParking, lavacar: Droplets,
};
export type Bilingual = { es: string; en: string };
export type DirectoryGroup = { id: string; es: string; en: string; icon: LucideIcon; sections: readonly string[] };

export const DIRECTORY_GROUPS: readonly DirectoryGroup[] = [
  { id: "comer", es: "Comer y beber", en: "Food and drink", icon: Utensils, sections: ["restaurantes", "cafes"] },
  { id: "compras", es: "Compras", en: "Shopping", icon: ShoppingCart, sections: ["supermercados", "pulperias", "ferreterias", "farmacias"] },
  { id: "salud", es: "Salud y bienestar", en: "Health and wellness", icon: HeartPulse, sections: ["salud", "veterinarias", "belleza", "gimnasios"] },
  { id: "autos", es: "Autos y combustible", en: "Cars and fuel", icon: Car, sections: ["gasolineras", "talleres", "parqueos", "lavacar"] },
  { id: "viajes", es: "Viajes", en: "Travel", icon: Plane, sections: ["hospedaje", "tours"] },
  { id: "dinero", es: "Dinero", en: "Money", icon: Landmark, sections: ["bancos"] },
];

/** One line per section (hub cards). */
export const DIRECTORY_SECTION_BLURBS: Record<string, Bilingual> = {
  restaurantes: { es: "Sodas, restaurantes y comida para llevar", en: "Sodas, restaurants and takeout" },
  cafes: { es: "Cafeterías, panaderías y bares", en: "Coffee shops, bakeries and bars" },
  supermercados: { es: "Supermercados y precios para comparar", en: "Supermarkets and prices to compare" },
  pulperias: { es: "Pulperías, minisúper y tiendas de barrio", en: "Corner stores and neighborhood shops" },
  ferreterias: { es: "Ferreterías y materiales de construcción", en: "Hardware stores and building supplies" },
  farmacias: { es: "Farmacias y horarios de atención", en: "Pharmacies and opening hours" },
  salud: { es: "Clínicas, consultorios y laboratorios", en: "Clinics, practices and labs" },
  veterinarias: { es: "Veterinarias y tiendas para mascotas", en: "Vets and pet shops" },
  belleza: { es: "Salones, barberías y spas", en: "Salons, barbers and spas" },
  gimnasios: { es: "Gimnasios y centros deportivos", en: "Gyms and sports centers" },
  gasolineras: { es: "Gasolineras y precios de combustible", en: "Fuel stations and fuel prices" },
  talleres: { es: "Talleres mecánicos, llantas y repuestos", en: "Auto repair, tires and parts" },
  hospedaje: { es: "Hoteles, cabinas y alojamientos", en: "Hotels, cabins and lodging" },
  tours: { es: "Tours y actividades turísticas", en: "Tours and tourist activities" },
  bancos: { es: "Bancos y cajeros automáticos", en: "Banks and ATMs" },
  parqueos: { es: "Parqueos públicos, techados y para motos", en: "Public, covered and motorcycle parking" },
  lavacar: { es: "Lavacar, autolavado y detallado", en: "Car washes, self-service and detailing" },
};

export type ResolvedDirectoryGroup = { id: string; label: Bilingual; icon: LucideIcon; sections: { section: string; label: Bilingual }[] };

/** The groups with only the enabled sections (unknown sections dropped, empty groups hidden). */
export function enabledDirectoryGroups(enabled: readonly string[]): ResolvedDirectoryGroup[] {
  return DIRECTORY_GROUPS
    .map((g) => ({
      id: g.id,
      label: { es: g.es, en: g.en },
      icon: g.icon,
      sections: g.sections.filter((s) => enabled.includes(s) && DIRECTORY_SECTION_LABELS[s]).map((s) => ({ section: s, label: DIRECTORY_SECTION_LABELS[s] })),
    }))
    .filter((g) => g.sections.length > 0);
}

/** CURATED menu (owner decision 2026-11-22, Yelp style): only the place categories people actually search for appear in the
 * Categorías menu, the mobile drawer, the footer and the home tiles; the rest (pulperias, ferreterias, tours, gimnasios,
 * talleres) stay reachable from /lugares ("Ver todos los lugares"). Order = order shown. */
export const CURATED_PLACE_SECTIONS: readonly string[] = ["restaurantes", "cafes", "supermercados", "pulperias", "ferreterias", "farmacias", "gasolineras", "talleres", "parqueos", "lavacar", "bancos", "hospedaje", "tours", "salud", "gimnasios", "veterinarias", "belleza"];

/** The curated place sections that are enabled, in curated order. */
export function curatedPlaces(enabled: readonly string[]): { section: string; label: Bilingual }[] {
  return CURATED_PLACE_SECTIONS.filter((s) => enabled.includes(s) && DIRECTORY_SECTION_LABELS[s]).map((s) => ({ section: s, label: DIRECTORY_SECTION_LABELS[s] }));
}

/** Same groups as enabledDirectoryGroups, restricted to the curated place sections (home tiles). */
export function curatedDirectoryGroups(enabled: readonly string[]): ResolvedDirectoryGroup[] {
  return enabledDirectoryGroups(enabled.filter((s) => CURATED_PLACE_SECTIONS.includes(s)));
}

/** Most demanded services per group for the Categorías menu (no per-service counts exist on the client, so this is an
 * editorial list by search demand in Costa Rica). Groups with 10 or fewer services show all of them; the rest go through
 * "Ver todos los servicios". */
export const SERVICE_MENU_TOP: Record<string, readonly string[]> = {
  hogar: ["plomeria", "electricidad", "pintura", "aire_acondicionado", "carpinteria", "cerrajeria", "jardineria", "techos", "control_plagas", "reparacion_electrodomesticos"],
  salud: ["psicologia", "odontologia", "nutricion", "fisioterapia", "pediatria", "optometria", "enfermeria", "medicina_domicilio", "cuidado_adultos", "ortodoncia"],
  automotriz: ["mecanica", "lavado_vehiculos", "mudanzas", "fletes", "grua", "cambio_llantas", "hojalateria", "electricidad_automotriz", "detailing", "transporte_privado"],
  tecnologia: ["reparacion_computadoras", "reparacion_celulares", "redes_internet", "camaras_seguridad", "desarrollo_web", "soporte_tecnico", "domotica", "reparacion_impresoras", "ciberseguridad", "consultoria_ti"],
  profesional: ["legal", "contabilidad", "bienes_raices", "notaria", "traduccion", "gestoria_tramites", "asesoria_tributaria", "corredor_seguros", "consultoria", "recursos_humanos"],
  comercios: ["panaderias", "panaderia", "carnicerias_verdulerias", "papelerias_librerias", "tiendas_mascotas"],
  eventos: ["fotografia_eventos", "organizacion_eventos", "dj_sonido", "catering", "decoracion", "alquiler_mobiliario", "floristeria", "animacion_infantil", "chef", "bartending"],
  educacion: ["tutorias", "idiomas", "matematicas", "preparacion_universitaria", "musica", "clases_manejo", "clases_baile", "clases_cocina", "clases_frances"],
};
export const SERVICE_MENU_LIMIT = 10;

/** ONE taxonomy by theme (owner decision 2026-11-22, Yelp style, no standalone "Lugares" entry): each place section of the
 * curated list lives INSIDE the service group (same ids as the Categorías menu left list) it belongs to by theme. Shown first
 * in that group's panel, in this order. Ferreterías, pulperías, tours, gimnasios and talleres are not in any group: they stay
 * reachable from /lugares and the footer. Restaurantes and cafés live in Comercios (no thin "Comida y bebida" group: the
 * catalogue already keeps food shops there), farmacias with Salud, veterinarias with Mascotas, bancos with Empresas. */
export const PLACE_MENU_GROUPS: Record<string, readonly string[]> = {
  comercios: ["restaurantes", "cafes", "supermercados", "pulperias", "ferreterias"],
  salud: ["salud", "farmacias"],
  bienestar: ["gimnasios"],
  automotriz: ["gasolineras", "talleres", "parqueos", "lavacar"],
  belleza: ["belleza"],
  mascotas: ["veterinarias"],
  turismo: ["hospedaje", "tours"],
  profesional: ["bancos"],
};

/** Service categories that duplicate a place section of the same group: hidden from the menus (still in /servicios). */
export const SERVICE_MENU_HIDE: ReadonlySet<string> = new Set(["restaurantes_comida", "cafeterias", "farmacias", "gasolineras", "supermercados_minisuper"]);

/** The enabled place sections that belong to a group, in the group's order. */
export function groupPlaces(groupId: string, enabled: readonly string[]): { section: string; label: Bilingual }[] {
  return (PLACE_MENU_GROUPS[groupId] ?? []).filter((s) => enabled.includes(s) && DIRECTORY_SECTION_LABELS[s]).map((s) => ({ section: s, label: DIRECTORY_SECTION_LABELS[s] }));
}

/** The services of a group shown in the Categorías menu: the editorial top list (if any), else the first ones; at most
 * SERVICE_MENU_LIMIT minus the places of the group (`reserve`), so the panel never has more than ten rows. */
export function curatedGroupItems<T extends { id: string }>(groupId: string, items: readonly T[], reserve = 0): T[] {
  const pool = reserve > 0 || (PLACE_MENU_GROUPS[groupId]?.length ?? 0) > 0 ? items.filter((i) => !SERVICE_MENU_HIDE.has(i.id)) : [...items];
  // Every place section of the theme is listed (owner 2026-11-22: Categorías holds everything), so places no longer eat into the services limit.
  void reserve;
  const limit = SERVICE_MENU_LIMIT;
  if (pool.length <= limit) return pool;
  const top = (SERVICE_MENU_TOP[groupId] ?? []).map((id) => pool.find((i) => i.id === id)).filter((i): i is T => !!i);
  return (top.length ? top : pool).slice(0, limit);
}

export const pick = (value: Bilingual, locale: string): string => value[idiomaDe(locale)];
