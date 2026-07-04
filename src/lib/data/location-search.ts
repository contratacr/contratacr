import { PROVINCES } from "@/lib/data/cr-geography";
import { normalizeText } from "@/lib/data/categories";

/* A location suggestion for the search bars. A province filters by `provincia`,
   a canton filters by `canton` (the /buscar page accepts both params). */
export type LocationSuggestion =
  | { type: "province"; id: string; label: string }
  | { type: "canton"; id: string; provinceId: string; label: string; sublabel: string };

// Flattened once at module load — provinces first, then every canton.
const ALL_LOCATIONS: LocationSuggestion[] = [
  ...PROVINCES.map((p) => ({ type: "province" as const, id: p.id, label: p.name })),
  ...PROVINCES.flatMap((p) =>
    p.cantons.map((c) => ({
      type: "canton" as const,
      id: c.id,
      provinceId: p.id,
      label: c.name,
      sublabel: p.name,
    }))
  ),
];

export function allLocationSuggestions(): LocationSuggestion[] {
  return ALL_LOCATIONS;
}

/* Smart-ish match: provinces always rank above cantons; prefix matches above
   loose "contains" matches. Returns up to `limit` suggestions. */
export function searchLocations(query: string, limit = ALL_LOCATIONS.length): LocationSuggestion[] {
  const q = normalizeText(query.trim());
  if (!q) return [];

  const scored: { item: LocationSuggestion; score: number }[] = [];
  for (const item of ALL_LOCATIONS) {
    const name = normalizeText(item.label);
    let score: number;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.includes(q)) score = 2;
    else continue;
    // Provinces float above cantons within the same match tier.
    if (item.type === "province") score -= 0.5;
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
