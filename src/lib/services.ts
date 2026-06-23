// Helpers for the pro's services list. The key job here is giving each service a
// UNIQUE, human display label so that casos de éxito (work photos) attach to the
// right service even when several services share the same name (e.g. three
// "Otro servicio"). Photos are tied to the service INSTANCE by id, never by name.

export type ServiceLike = {
  id: string;
  name: string;
  description?: string;
  category?: string;
};

/**
 * Build id → display label, disambiguating duplicate names: when a name repeats,
 * append the description snippet if present, else an ordinal "(2)", "(3)". So the
 * pro and clients can always tell the repeated services (and their photos) apart.
 */
/**
 * The PROFESSION (category id) a caso de éxito photo belongs to. Casos are organized BY
 * PROFESSION, not by individual service. Existing photos are migrated LOSSLESSLY at read time:
 * use the item's explicit `profession`, else derive it from its (legacy) `serviceId`'s service
 * category, else fall back to the pro's primary profession. (New uploads store `profession`
 * directly; the derived value persists the next time the editor saves.)
 */
export function casoProfession(
  item: { serviceId?: string; profession?: string },
  services: ServiceLike[],
  primaryProfession?: string,
): string {
  if (item.profession) return item.profession;
  const cat = services.find((s) => s.id === item.serviceId)?.category;
  return cat || primaryProfession || "";
}

/**
 * Count CASES (not photos) for "casos de éxito". A NEW-shape item (it has a `photos[]`
 * array) is ONE case no matter how many photos it holds; legacy loose `{url}` photos group
 * into cases of up to 3 (the per-case photo limit). Pure-legacy data (only `portfolio_urls`,
 * no items) → ceil(photos / 3). So a pro with 1 case of 3 photos counts as **1**, never 3 —
 * `portfolio_urls` is the flattened PHOTO list and must NOT be used as the case count.
 */
export function countCases(items?: readonly unknown[] | null, urls?: readonly unknown[] | null): number {
  const list = Array.isArray(items) ? items : [];
  if (list.length > 0) {
    let cases = 0;
    let legacyPhotos = 0;
    for (const raw of list) {
      const it = raw as { photos?: unknown; url?: string } | null;
      if (it && Array.isArray(it.photos)) cases++;
      else if (it && it.url) legacyPhotos++;
    }
    return cases + Math.ceil(legacyPhotos / 3);
  }
  return Math.ceil((urls?.length ?? 0) / 3);
}

export function serviceLabelMap(services: ServiceLike[]): Map<string, string> {
  const norm = (s: string) => s.trim().toLowerCase();
  const counts = new Map<string, number>();
  for (const s of services) counts.set(norm(s.name), (counts.get(norm(s.name)) ?? 0) + 1);

  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const s of services) {
    const key = norm(s.name);
    const name = s.name.trim();
    if ((counts.get(key) ?? 0) <= 1) {
      out.set(s.id, name);
      continue;
    }
    const desc = s.description?.trim();
    if (desc) {
      out.set(s.id, `${name} — ${desc.length > 28 ? desc.slice(0, 28) + "…" : desc}`);
    } else {
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      out.set(s.id, `${name} (${n})`);
    }
  }
  return out;
}
