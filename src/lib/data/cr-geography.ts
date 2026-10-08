export type Province = {
  id: string;
  /**
   * El nombre para la dirección: `san-jose`, no `sj`.
   *
   * Las páginas de oficio+provincia son las de más intención de compra del
   * sitio —alguien que busca «electricista en San José» ya sabe lo que
   * quiere— y su dirección decía `/servicios/electricidad/sj`. Dos letras que
   * no significan nada para Google ni para quien lee el enlace antes de
   * tocarlo. El id de dos letras se sigue aceptando y redirige aquí, porque
   * está en el sitemap y en enlaces ya publicados.
   */
  slug: string;
  name: string;
  cantons: Canton[];
};

export type Canton = {
  id: string;
  name: string;
  provinceId: string;
  /** «Vásquez de Coronado» → «vasquez-de-coronado»; lo que va en la dirección. */
  slug?: string;
};

export const PROVINCES: Province[] = [
  {
    id: "sj",
    slug: "san-jose",
    name: "San José",
    cantons: [
      { id: "sj-sj", name: "San José", provinceId: "sj" },
      { id: "sj-es", name: "Escazú", provinceId: "sj" },
      { id: "sj-de", name: "Desamparados", provinceId: "sj" },
      { id: "sj-pu", name: "Puriscal", provinceId: "sj" },
      { id: "sj-ta", name: "Tarrazú", provinceId: "sj" },
      { id: "sj-as", name: "Aserrí", provinceId: "sj" },
      { id: "sj-mo", name: "Mora", provinceId: "sj" },
      { id: "sj-go", name: "Goicoechea", provinceId: "sj" },
      { id: "sj-sa", name: "Santa Ana", provinceId: "sj" },
      { id: "sj-al", name: "Alajuelita", provinceId: "sj" },
      { id: "sj-vb", name: "Vásquez de Coronado", provinceId: "sj" },
      { id: "sj-ac", name: "Acosta", provinceId: "sj" },
      { id: "sj-ti", name: "Tibás", provinceId: "sj" },
      { id: "sj-mo2", name: "Moravia", provinceId: "sj" },
      { id: "sj-mu", name: "Montes de Oca", provinceId: "sj" },
      { id: "sj-tu", name: "Turrubares", provinceId: "sj" },
      { id: "sj-da", name: "Dota", provinceId: "sj" },
      { id: "sj-cu", name: "Curridabat", provinceId: "sj" },
      { id: "sj-pm", name: "Pérez Zeledón", provinceId: "sj" },
      { id: "sj-le", name: "León Cortés Castro", provinceId: "sj" },
    ],
  },
  {
    id: "al",
    slug: "alajuela",
    name: "Alajuela",
    cantons: [
      { id: "al-al", name: "Alajuela", provinceId: "al" },
      { id: "al-sa", name: "San Ramón", provinceId: "al" },
      { id: "al-gr", name: "Grecia", provinceId: "al" },
      { id: "al-sm", name: "San Mateo", provinceId: "al" },
      { id: "al-at", name: "Atenas", provinceId: "al" },
      { id: "al-na", name: "Naranjo", provinceId: "al" },
      { id: "al-pa", name: "Palmares", provinceId: "al" },
      { id: "al-po", name: "Poás", provinceId: "al" },
      { id: "al-oc", name: "Orotina", provinceId: "al" },
      { id: "al-sc", name: "San Carlos", provinceId: "al" },
      { id: "al-za", name: "Zarcero", provinceId: "al" },
      { id: "al-va", name: "Sarchí", provinceId: "al" },
      { id: "al-up", name: "Upala", provinceId: "al" },
      { id: "al-lo", name: "Los Chiles", provinceId: "al" },
      { id: "al-gu", name: "Guatuso", provinceId: "al" },
      { id: "al-rc", name: "Río Cuarto", provinceId: "al" },
    ],
  },
  {
    id: "ca",
    slug: "cartago",
    name: "Cartago",
    cantons: [
      { id: "ca-ca", name: "Cartago", provinceId: "ca" },
      { id: "ca-pa", name: "Paraíso", provinceId: "ca" },
      { id: "ca-lu", name: "La Unión", provinceId: "ca" },
      { id: "ca-ji", name: "Jiménez", provinceId: "ca" },
      { id: "ca-tu", name: "Turrialba", provinceId: "ca" },
      { id: "ca-al", name: "Alvarado", provinceId: "ca" },
      { id: "ca-oa", name: "Oreamuno", provinceId: "ca" },
      { id: "ca-el", name: "El Guarco", provinceId: "ca" },
    ],
  },
  {
    id: "he",
    slug: "heredia",
    name: "Heredia",
    cantons: [
      { id: "he-he", name: "Heredia", provinceId: "he" },
      { id: "he-ba", name: "Barva", provinceId: "he" },
      { id: "he-sd", name: "Santo Domingo", provinceId: "he" },
      { id: "he-sa", name: "Santa Bárbara", provinceId: "he" },
      { id: "he-sr", name: "San Rafael", provinceId: "he" },
      { id: "he-si", name: "San Isidro", provinceId: "he" },
      { id: "he-be", name: "Belén", provinceId: "he" },
      { id: "he-fl", name: "Flores", provinceId: "he" },
      { id: "he-sp", name: "San Pablo", provinceId: "he" },
      { id: "he-sa2", name: "Sarapiquí", provinceId: "he" },
    ],
  },
  {
    id: "gu",
    slug: "guanacaste",
    name: "Guanacaste",
    cantons: [
      { id: "gu-li", name: "Liberia", provinceId: "gu" },
      { id: "gu-ni", name: "Nicoya", provinceId: "gu" },
      { id: "gu-sc", name: "Santa Cruz", provinceId: "gu" },
      { id: "gu-ba", name: "Bagaces", provinceId: "gu" },
      { id: "gu-ca", name: "Carrillo", provinceId: "gu" },
      { id: "gu-ca2", name: "Cañas", provinceId: "gu" },
      { id: "gu-ab", name: "Abangares", provinceId: "gu" },
      { id: "gu-ti", name: "Tilarán", provinceId: "gu" },
      { id: "gu-na", name: "Nandayure", provinceId: "gu" },
      { id: "gu-lc", name: "La Cruz", provinceId: "gu" },
      { id: "gu-ho", name: "Hojancha", provinceId: "gu" },
    ],
  },
  {
    id: "pu",
    slug: "puntarenas",
    name: "Puntarenas",
    cantons: [
      { id: "pu-pu", name: "Puntarenas", provinceId: "pu" },
      { id: "pu-es", name: "Esparza", provinceId: "pu" },
      { id: "pu-bv", name: "Buenos Aires", provinceId: "pu" },
      { id: "pu-mo", name: "Montes de Oro", provinceId: "pu" },
      { id: "pu-os", name: "Osa", provinceId: "pu" },
      { id: "pu-ag", name: "Quepos", provinceId: "pu" },
      { id: "pu-ga", name: "Golfito", provinceId: "pu" },
      { id: "pu-cc", name: "Coto Brus", provinceId: "pu" },
      { id: "pu-pa", name: "Parrita", provinceId: "pu" },
      { id: "pu-co", name: "Corredores", provinceId: "pu" },
      { id: "pu-ga2", name: "Garabito", provinceId: "pu" },
      { id: "pu-mv", name: "Monteverde", provinceId: "pu" },
      { id: "pu-pj", name: "Puerto Jiménez", provinceId: "pu" },
    ],
  },
  {
    id: "li",
    slug: "limon",
    name: "Limón",
    cantons: [
      { id: "li-li", name: "Limón", provinceId: "li" },
      { id: "li-po", name: "Pococí", provinceId: "li" },
      { id: "li-si", name: "Siquirres", provinceId: "li" },
      { id: "li-ta", name: "Talamanca", provinceId: "li" },
      { id: "li-ma", name: "Matina", provinceId: "li" },
      { id: "li-gu", name: "Guácimo", provinceId: "li" },
    ],
  },
];

export function getCantonsByProvince(provinceId: string): Canton[] {
  return PROVINCES.find((p) => p.id === provinceId)?.cantons ?? [];
}

export function getProvinceById(id: string): Province | undefined {
  return PROVINCES.find((p) => p.id === id);
}

/**
 * Acepta las dos formas de nombrar una provincia en una dirección: el nombre
 * legible (`san-jose`) y el código viejo de dos letras (`sj`). El código se
 * sigue aceptando para no romper lo que ya está indexado y compartido; la
 * página lo redirige a la forma legible.
 */
export function getProvinceBySlugOrId(valor: string): Province | undefined {
  const limpio = valor.toLowerCase();
  return PROVINCES.find((p) => p.slug === limpio) ?? PROVINCES.find((p) => p.id === limpio);
}

/** Haversine distance in km between two lat/lng points. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function getCantonById(id: string): Canton | undefined {
  for (const province of PROVINCES) {
    const canton = province.cantons.find((c) => c.id === id);
    if (canton) return canton;
  }
  return undefined;
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/provincia de|province|canton de|canton/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Best-effort match of Google reverse-geocode admin-area names to our province
 * and canton IDs (used to auto-fill the registration fields from a dropped pin).
 */
export function matchProvinceCanton(
  provinceName?: string,
  cantonName?: string
): { provinceId?: string; cantonId?: string } {
  if (!provinceName && !cantonName) return {};
  const np = provinceName ? normalizeName(provinceName) : "";
  const nc = cantonName ? normalizeName(cantonName) : "";

  let province = np
    ? PROVINCES.find((p) => normalizeName(p.name) === np || np.includes(normalizeName(p.name)))
    : undefined;

  // Some results omit the province; infer it from the canton instead.
  if (!province && nc) {
    province = PROVINCES.find((p) => p.cantons.some((c) => normalizeName(c.name) === nc));
  }
  if (!province) return {};

  const canton = nc
    ? province.cantons.find((c) => normalizeName(c.name) === nc || nc.includes(normalizeName(c.name)))
    : undefined;

  return { provinceId: province.id, cantonId: canton?.id };
}

// EL CANTÓN EN LA DIRECCIÓN POR SU NOMBRE, NO POR SU CLAVE. La búsqueda se
// compartía como `?provincia=al&canton=al-gr`: claves internas de la base a la
// vista, que en un WhatsApp se leen como un enlace de máquina. Con el nombre
// —`/servicios/electricistas/alajuela/grecia`— se lee y se entiende. El slug
// se deriva del nombre al cargar el módulo (nada que mantener a mano) y es
// único dentro de su provincia, que es el único ámbito en que se resuelve.
function slugDeNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
for (const provincia of PROVINCES) {
  const vistos = new Set<string>();
  for (const canton of provincia.cantons) {
    let slug = slugDeNombre(canton.name);
    if (vistos.has(slug)) slug = `${slug}-${canton.id.split("-")[1] ?? ""}`;
    vistos.add(slug);
    canton.slug = slug;
  }
}

/** «Grecia, Alajuela» — y solo «Alajuela» cuando el cantón se llama como su provincia. */
export function nombreDeLugar(canton: { name: string } | undefined, province: { name: string } | undefined): string {
  if (!province) return canton?.name ?? "";
  if (!canton || canton.name === province.name) return province.name;
  return `${canton.name}, ${province.name}`;
}

/** Resuelve un cantón dentro de su provincia por slug («grecia») o por clave («al-gr»). */
export function getCantonBySlugOrId(province: Province, valor: string): Canton | undefined {
  const v = String(valor ?? "").trim().toLowerCase();
  if (!v) return undefined;
  return province.cantons.find((c) => c.slug === v || c.id === v);
}
