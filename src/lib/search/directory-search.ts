import { VERTICAL_VOCABULARY, matchVerticals, normalizeIntentText, type DirectoryVertical } from "@/lib/directory/vertical-vocabulary";
import { PROVINCES } from "@/lib/data/cr-geography";

// ONE SEARCH FOR EVERYTHING (owner, 2026-11-19, Yelp style): the header/home
// search finds professional services AND the place directory. Client-safe (no
// server flags here): callers pass the sections that are ON, from
// useSiteFeatures().directorySections — empty while DIR_ENABLED is off, so the
// directory never shows where it is disabled.

/** Short section names (menu, home band and search suggestions). */
export const DIRECTORY_SECTION_LABELS: Record<string, { es: string; en: string }> = {
  restaurantes: { es: "Restaurantes", en: "Restaurants" },
  cafes: { es: "Cafés y bares", en: "Cafés and bars" },
  supermercados: { es: "Supermercados", en: "Supermarkets" },
  pulperias: { es: "Pulperías", en: "Corner stores" },
  farmacias: { es: "Farmacias", en: "Pharmacies" },
  ferreterias: { es: "Ferreterías", en: "Hardware stores" },
  gasolineras: { es: "Gasolineras", en: "Fuel stations" },
  talleres: { es: "Talleres", en: "Auto repair" },
  hospedaje: { es: "Hospedaje", en: "Lodging" },
  tours: { es: "Tours", en: "Tours" },
  belleza: { es: "Belleza", en: "Beauty" },
  gimnasios: { es: "Gimnasios", en: "Gyms" },
  veterinarias: { es: "Veterinarias", en: "Vets and pets" },
  salud: { es: "Salud", en: "Health" },
  bancos: { es: "Bancos y cajeros", en: "Banks and ATMs" },
};

export function directorySectionLabel(section: string, locale: string): string {
  const label = DIRECTORY_SECTION_LABELS[section];
  return label ? (locale === "en" ? label.en : label.es) : section;
}

/** Placeholder of the unified search field (directory on) or the classic one. */
export function unifiedSearchPlaceholder(locale: string, directoryOn: boolean, short = false): string {
  if (!directoryOn) return locale === "en" ? "What service are you looking for?" : "¿Qué servicio está buscando?";
  if (short) return locale === "en" ? "Services, restaurants..." : "Servicios, restaurantes...";
  return locale === "en" ? "Services, restaurants, pharmacies..." : "Servicios, restaurantes, farmacias...";
}

const termsBySection = new Map<string, string[]>();
function sectionTerms(section: string): string[] {
  let terms = termsBySection.get(section);
  if (!terms) {
    const label = DIRECTORY_SECTION_LABELS[section];
    const vocabulary = VERTICAL_VOCABULARY[section as DirectoryVertical] ?? [];
    terms = [...new Set([label?.es, label?.en, section, ...vocabulary].filter((t): t is string => !!t).map(normalizeIntentText).filter(Boolean))];
    termsBySection.set(section, terms);
  }
  return terms;
}

export type DirectorySectionSuggestion = { section: string; label: string };

/**
 * Sections whose name or search words start with what was typed («farm» →
 * Farmacias, «gasol» → Gasolineras, «soda» → Restaurantes). Cheap and local: no
 * request. At most `limit`, best match first, in the order of `enabled`.
 */
export function suggestDirectorySections(text: string, enabled: readonly string[], locale: string, limit = 3): DirectorySectionSuggestion[] {
  const q = normalizeIntentText(text);
  if (q.length < 3 || !enabled.length) return [];
  const scored: { section: string; score: number; order: number }[] = [];
  enabled.forEach((section, order) => {
    if (!DIRECTORY_SECTION_LABELS[section]) return;
    let score = 0;
    for (const term of sectionTerms(section)) {
      if (term === q) score = Math.max(score, 4);
      else if (term.startsWith(q)) score = Math.max(score, 3);
      else if (` ${q} `.includes(` ${term} `) && term.length >= 4) score = Math.max(score, 2);
    }
    if (score > 0) scored.push({ section, score, order });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ section }) => ({ section, label: directorySectionLabel(section, locale) }));
}

// Free text sent WITHOUT picking a suggestion goes to a directory section only
// when it clearly names a place. Sections that overlap professional services
// (salud, belleza, veterinarias, talleres: dentists, barbers, groomers,
// mechanics) keep the professionals search; their section is still offered in
// the suggestions. Words that also name a trade («bomba» de agua, «pinturas»,
// «delivery», «a domicilio»…) never redirect on their own.
const FREE_TEXT_SECTIONS = new Set(["restaurantes", "cafes", "gasolineras", "farmacias", "supermercados", "pulperias", "ferreterias", "hospedaje", "tours", "bancos", "gimnasios"]);
const NOT_ON_THEIR_OWN = new Set([
  "bomba", "bombas", "a domicilio", "delivery", "lunch", "menu", "pinturas", "materiales de construccion", "kiosco", "pub",
  "agencia de viajes", "crossfit", "artes marciales", "pilates", "casa de cambio", "carniceria", "verduleria", "mas x menos",
].map(normalizeIntentText));

export function directorySectionForQuery(text: string, enabled: readonly string[]): string | null {
  if (!enabled.length) return null;
  for (const match of matchVerticals(text)) {
    if (!FREE_TEXT_SECTIONS.has(match.vertical) || !enabled.includes(match.vertical)) continue;
    if (match.terms.some((term) => !NOT_ON_THEIR_OWN.has(term) && match.score >= 2)) return match.vertical;
  }
  return null;
}

// Search words that ARE what people look for inside a section (a dish, a chain,
// an activity): they stay as the text query. Every other section word only
// names the section and is dropped, so «gasolina» or «almuerzo» open the whole
// section instead of a text filter with no results.
const KEPT_AS_QUERY = new Set([
  "soda", "sodas", "pizza", "pizzeria", "sushi", "hamburguesa", "pollo frito", "chifrijo", "marisqueria", "casado", "gallo pinto",
  "fischel", "sucre", "automercado", "maxi pali", "pali", "masxmenos", "walmart", "megasuper", "perimercados", "pricesmart",
  "heladeria", "panaderia", "panaderias", "reposteria", "pasteleria", "cerveceria", "yoga", "canopy", "museo", "museos", "zoologico",
  "glamping", "camping", "hostal", "hostel", "cajero", "cajeros", "atm", "casa de cambio",
].map(normalizeIntentText));
const CONNECTORS = new Set(["en", "de", "del", "la", "el", "los", "las", "cerca", "near", "in", "the", "y", "and", "a", "por", "un", "una"]);

/** Text query for a section page: what is left once the section's own words are removed («farmacia en Heredia» → «heredia»). */
export function directorySectionQuery(section: string, text: string): string {
  const typed = normalizeIntentText(text);
  if (!typed) return "";
  if (KEPT_AS_QUERY.has(typed)) return text.trim();
  const terms = sectionTerms(section);
  // Half-typed section word («farm», «gasol»): it only chose the section.
  if (terms.some((term) => term.startsWith(typed))) return "";
  let padded = ` ${typed} `;
  let removed = false;
  for (const term of [...terms].sort((a, b) => b.length - a.length)) {
    if (KEPT_AS_QUERY.has(term) || !padded.includes(` ${term} `)) continue;
    padded = padded.split(` ${term} `).join(" ");
    removed = true;
  }
  const words = padded.trim().split(/\s+/).filter((word) => word && !CONNECTORS.has(word));
  if (!words.length) return "";
  return removed ? words.join(" ") : text.trim();
}

export type DirectoryLocation = { provinceId?: string | null; cantonId?: string | null; lat?: number | null; lng?: number | null };

/**
 * Section page with the typed text and the location, in the parameters the
 * section page already reads (q, province, canton by name, lat/lng).
 */
export function directorySectionHref(section: string, text: string, location: DirectoryLocation = {}): string {
  const params = new URLSearchParams();
  const q = directorySectionQuery(section, text).slice(0, 100);
  if (q) params.set("q", q);
  const province = location.provinceId ? PROVINCES.find((p) => p.id === location.provinceId) : undefined;
  if (province) {
    params.set("province", province.name);
    const canton = location.cantonId ? province.cantons.find((c) => c.id === location.cantonId) : undefined;
    if (canton) params.set("canton", canton.name);
  }
  if (location.lat != null && location.lng != null && Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
    params.set("lat", location.lat.toFixed(5));
    params.set("lng", location.lng.toFixed(5));
  }
  const query = params.toString();
  return `/${section}${query ? `?${query}` : ""}`;
}

/**
 * The professional catalogue also has shop categories (Comercios: «Farmacias»,
 * «Gasolineras»…). When the same name is offered under «Lugares», the service row
 * is dropped so the list does not show «Farmacias» twice.
 */
export function withoutPlaceDuplicates<T>(items: T[], label: (item: T) => string, places: DirectorySectionSuggestion[]): T[] {
  if (!places.length) return items;
  const names = new Set(places.map((p) => normalizeIntentText(p.label)));
  return items.filter((item) => !names.has(normalizeIntentText(label(item))));
}
