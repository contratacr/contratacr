// Shared location model helpers. Pins (workplaces) are the single source of truth
// for fixed locations — each carries a reverse-geocoded provincia/cantón/distrito.
// "Me desplazo" professionals instead pick coverage areas (provincia+cantón).

export type CoverageArea = {
  provinciaId: string;
  cantonId: string;
  provinceName?: string;
  cantonName?: string;
};

export type LocatedWorkplace = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  provinciaId?: string;
  cantonId?: string;
  distrito?: string;
};

/**
 * Denormalized search arrays: every provincia/cantón a professional appears under,
 * combining fixed-location pins and travel coverage areas. Used by /buscar to match
 * a pro to a searched place via an array-contains query.
 */
export function computeSearchAreas(
  workplaces: { provinciaId?: string; cantonId?: string }[] = [],
  coverage: CoverageArea[] = []
): { provincias: string[]; cantones: string[] } {
  const provincias = new Set<string>();
  const cantones = new Set<string>();
  for (const w of workplaces) {
    if (w.provinciaId) provincias.add(w.provinciaId);
    if (w.cantonId) cantones.add(w.cantonId);
  }
  for (const c of coverage) {
    if (c.provinciaId) provincias.add(c.provinciaId);
    if (c.cantonId) cantones.add(c.cantonId);
  }
  return { provincias: Array.from(provincias), cantones: Array.from(cantones) };
}

/** Primary provincia/cantón for back-compat display (first pin, else first coverage). */
export function primaryArea(
  workplaces: { provinciaId?: string; cantonId?: string }[] = [],
  coverage: CoverageArea[] = []
): { provinciaId?: string; cantonId?: string } {
  const wp = workplaces.find((w) => w.provinciaId || w.cantonId);
  if (wp) return { provinciaId: wp.provinciaId, cantonId: wp.cantonId };
  const c = coverage[0];
  return c ? { provinciaId: c.provinciaId, cantonId: c.cantonId } : {};
}
