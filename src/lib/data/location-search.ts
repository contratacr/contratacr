import { PROVINCES } from "@/lib/data/cr-geography";
import { DISTRICTS, PLACE_ALIASES } from "@/lib/data/cr-districts";
import { normalizeText } from "@/lib/data/categories";

/* A location suggestion for the search bars. A province filters by `provincia`,
   a canton filters by `canton` (the /buscar page accepts both params). */
type LocationSource = { kind: "province" | "canton" | "district" | "place"; searchAliases?: string[] };
export type LocationSuggestion = LocationSource & (
  | { type: "province"; id: string; label: string }
  | { type: "canton"; id: string; provinceId: string; label: string; sublabel: string });

// Flattened once at module load — provinces first, then every canton.
const ALL_LOCATIONS: LocationSuggestion[] = [
  ...PROVINCES.map((p) => ({ type: "province" as const, kind: "province" as const, id: p.id, label: p.name })),
  ...PROVINCES.flatMap((p) =>
    p.cantons.map((c) => ({
      type: "canton" as const,
      kind: "canton" as const,
      id: c.id,
      provinceId: p.id,
      label: c.name,
      sublabel: p.name,
    }))
  ),
];

// Los distritos NO son un nivel más de filtro: los profesionales se ubican por
// cantón. Cada uno se ofrece como sugerencia con su propio nombre y filtra por
// el cantón al que pertenece, así que escribir "San Pedro" trae a los de Montes
// de Oca. Sin esto, el buscador no reconocía el nombre del lugar donde vive la
// mayoría: San Pedro, Jacó, Tres Ríos, Tamarindo, Pavas, Hatillo…
const CANTON_POR_ID = new Map(
  PROVINCES.flatMap((p) => p.cantons.map((c) => [c.id, { canton: c, provincia: p }] as const)),
);

const DISTRICT_LOCATIONS: LocationSuggestion[] = [
  ...DISTRICTS.map((d) => ({ ...d, kind: "district" as const })),
  ...PLACE_ALIASES.map((d) => ({ ...d, kind: "place" as const })),
].flatMap((d) => {
  const padre = CANTON_POR_ID.get(d.cantonId);
  if (!padre) return [];
  return [{
    type: "canton" as const,
    kind: d.kind,
    id: padre.canton.id,
    provinceId: padre.provincia.id,
    label: d.name,
    searchAliases: d.searchAliases,
    sublabel: `${padre.canton.name}, ${padre.provincia.name}`,
  }];
});

// The source level is distinct from the effective filter. Districts and local
// names still filter by canton; a province must never collapse into its capital.
export function locationSuggestionKey(item: LocationSuggestion): string {
  return `${item.type}:${item.id}:${normalizeText(item.label)}`;
}

export function locationSuggestionContext(item: LocationSuggestion, locale = "es"): string {
  const names = locale === "en"
    ? { province: "Province", canton: "Canton", district: "District", place: "Place" }
    : { province: "Provincia", canton: "Cantón", district: "Distrito", place: "Lugar" };
  return item.type === "province" ? names[item.kind] : `${names[item.kind]} · ${item.sublabel}`;
}

// Prefer the administrative entry over a redundant district/alias, retaining
// every homonym with a different filter target and merging useful spellings.
const SEARCH_LOCATIONS = new Map<string, LocationSuggestion>();
for (const item of [...ALL_LOCATIONS, ...DISTRICT_LOCATIONS]) {
  const key = locationSuggestionKey(item);
  const existing = SEARCH_LOCATIONS.get(key);
  if (!existing) SEARCH_LOCATIONS.set(key, item);
  else if (item.searchAliases?.length) {
    existing.searchAliases = [...new Set([...(existing.searchAliases ?? []), ...item.searchAliases])];
  }
}

export function allLocationSuggestions(): LocationSuggestion[] {
  return ALL_LOCATIONS;
}

/* Smart-ish match: provinces always rank above cantons; prefix matches above
   loose "contains" matches. Returns up to `limit` suggestions. */
export function searchLocations(query: string, limit = ALL_LOCATIONS.length): LocationSuggestion[] {
  const q = normalizeText(query.trim());
  if (!q) return [];

  const scored: { item: LocationSuggestion; score: number }[] = [];
  // Los distritos van después: primero lo que la persona probablemente quiso
  // decir (una provincia o un cantón) y solo entonces el barrio del mismo nombre.
  for (const item of SEARCH_LOCATIONS.values()) {
    const names = [item.label, ...(item.searchAliases ?? [])].map(normalizeText);
    let score: number;
    if (names.includes(q)) score = 0;
    else if (names.some((name) => name.startsWith(q))) score = 1;
    else if (names.some((name) => name.includes(q))) score = 2;
    else continue;
    // Provinces float above cantons within the same match tier.
    if (item.type === "province") score -= 0.5;
    // Un distrito nunca desplaza a un cantón que empata con lo escrito.
    if (item.kind === "district" || item.kind === "place") score += 0.25;
    scored.push({ item, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((s) => s.item);
}

/* Resolve a raw typed location string to a single suggestion (exact, then
   prefix). Used when the user types a location but never picks from the list. */
export function resolveLocation(query: string): LocationSuggestion | null {
  return searchLocations(query, 1)[0] ?? null;
}
