// Shared location model helpers.
//
// FIXED locations (workplaces): the professional first selects an authoritative
// provincia + cantón (used for /buscar filtering), then optionally drops a map
// pin that is PURELY a visual marker. The pin never derives the provincia/cantón.
//
// TRAVEL coverage ("me desplazo"): hierarchical — a specific cantón, an entire
// provincia, or the whole country. /buscar matches via the hierarchy, not exact
// text: a searched cantón matches if it is covered directly, via its provincia,
// or via whole-country coverage.

export type CoverageLevel = "canton" | "provincia" | "country";

export type CoverageArea = {
  /** "canton" (provincia+cantón), "provincia" (whole province), "country" (everywhere). */
  level?: CoverageLevel;
  provinciaId?: string;
  cantonId?: string;
  provinceName?: string;
  cantonName?: string;
};

export type LocatedWorkplace = {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  // Authoritative, user-selected administrative areas (NOT derived from the pin).
  provinciaId?: string;
  cantonId?: string;
};

/**
 * Denormalized search arrays for /buscar.
 * - cantones: exact cantones a pro appears under (fixed pins + cantón-level coverage).
 * - provincias: provinces a pro appears under for a PROVINCE search (pins + all coverage).
 * - coverageProvincias: provinces the pro covers WHOLE — any cantón inside matches.
 * - coverageCountry: covers the entire country — every cantón/provincia matches.
 */
export function computeSearchAreas(
  workplaces: { provinciaId?: string; cantonId?: string }[] = [],
  coverage: CoverageArea[] = []
): { provincias: string[]; cantones: string[]; coverageProvincias: string[]; coverageCountry: boolean } {
  const provincias = new Set<string>();
  const cantones = new Set<string>();
  const coverageProvincias = new Set<string>();
  let coverageCountry = false;

  for (const w of workplaces) {
    if (w.provinciaId) provincias.add(w.provinciaId);
    if (w.cantonId) cantones.add(w.cantonId);
  }
  for (const c of coverage) {
    const level = c.level ?? (c.cantonId ? "canton" : "provincia");
    if (level === "country") {
      coverageCountry = true;
      continue;
    }
    if (c.provinciaId) provincias.add(c.provinciaId);
    if (level === "provincia") {
      if (c.provinciaId) coverageProvincias.add(c.provinciaId);
    } else if (c.cantonId) {
      cantones.add(c.cantonId);
    }
  }
  return {
    provincias: Array.from(provincias),
    cantones: Array.from(cantones),
    coverageProvincias: Array.from(coverageProvincias),
    coverageCountry,
  };
}

/** Primary provincia/cantón for back-compat display (first pin, else first coverage). */
export function primaryArea(
  workplaces: { provinciaId?: string; cantonId?: string }[] = [],
  coverage: CoverageArea[] = []
): { provinciaId?: string; cantonId?: string } {
  const wp = workplaces.find((w) => w.provinciaId || w.cantonId);
  if (wp) return { provinciaId: wp.provinciaId, cantonId: wp.cantonId };
  const c = coverage.find((a) => a.provinciaId || a.cantonId);
  return c ? { provinciaId: c.provinciaId, cantonId: c.cantonId } : {};
}
