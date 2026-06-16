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
