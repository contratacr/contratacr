// El enlace que se comparte de una oferta o de un empleo:
// contratacr.com/promociones/camaras-de-seguridad-b1baacf7
//
// Se lee como el del perfil (contratacr.com/nombre-apellido) y el de una
// cotización: sin el idioma en medio y sin el identificador de 36 caracteres.
// El tramo final son los 8 primeros del id, que es lo que lo hace único: dos
// ofertas pueden llamarse igual, dos ids no empiezan igual.
//
// El enlace largo de siempre (/es/promociones/<id completo>) sigue funcionando, así
// que nada de lo ya compartido o indexado se rompe.

const SUFIJO = /-([0-9a-f]{8})$/i;

function conGuiones(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

function base(baseUrl?: string): string {
  const origen = baseUrl || (typeof window !== "undefined" ? window.location.origin : "") || process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";
  const limpia = origen.replace(/\/$/, "");
  // Las vistas previas de Vercel no se comparten con nadie.
  if (/\.vercel\.app$/i.test(limpia.replace(/^https?:\/\//, "").split("/")[0])) return "https://contratacr.com";
  return limpia;
}

/** "Cámaras de seguridad" + id → "camaras-de-seguridad-b1baacf7" */
export function tramoFicha(titulo: string, id: string): string {
  const corto = String(id ?? "").split("-")[0]?.toLowerCase() ?? "";
  const nombre = conGuiones(titulo);
  return [nombre, corto].filter(Boolean).join("-");
}

/**
 * Ruta interna de la ficha, con el título delante: /promociones/camaras-b1baacf7.
 * El sitemap y el canonical ya la usaban; los enlaces de la app seguían
 * poniendo el UUID entero y esa era la dirección que se veía en la barra.
 */
export function rutaPromocion(offer: { id: string; title?: string | null }): string {
  return `/promociones/${tramoFicha(offer.title ?? "", offer.id)}`;
}
export function rutaEmpleo(job: { id: string; title?: string | null }): string {
  return `/empleos/${tramoFicha(job.title ?? "", job.id)}`;
}
export function rutaProyecto(project: { id: string; title?: string | null }): string {
  return `/proyectos/${tramoFicha(project.title ?? "", project.id)}`;
}

// EL ENLACE QUE SE COMPARTE ES EL LEGIBLE (3-oct-2026): contratacr.com/empleos/
// asistente-contable-d4000000, el mismo que el de Proyectos y el que se ve en
// la barra. El corto (/e/d4000000, /o/…, /p/…) se leía como un código y no
// decía qué era; sigue funcionando para lo que ya se compartió.
function prefijoActual(): string {
  return typeof window !== "undefined" && /^\/en(?:\/|$)/.test(window.location.pathname) ? "/en" : "";
}

/** contratacr.com/promociones/camaras-de-seguridad-b1baacf7 */
export function enlaceOferta(offer: { id: string; title?: string | null }, baseUrl?: string): string {
  return `${base(baseUrl)}${prefijoActual()}${rutaPromocion(offer)}`;
}

/** contratacr.com/empleos/asistente-contable-d4000000 */
export function enlaceEmpleo(job: { id: string; title?: string | null }, baseUrl?: string): string {
  return `${base(baseUrl)}${prefijoActual()}${rutaEmpleo(job)}`;
}

/** contratacr.com/proyectos/fuga-en-la-cocina-1b93475f */
export function enlaceProyecto(project: { id: string; title?: string | null }, baseUrl?: string): string {
  return `${base(baseUrl)}${prefijoActual()}${rutaProyecto(project)}`;
}
/** Los 8 primeros del id: es lo que hace único al enlace. */
export function codigoCorto(id: string): string {
  return String(id ?? "").split("-")[0]?.toLowerCase() ?? "";
}

/**
 * Del tramo de la URL saca cómo buscar la ficha: el id completo si vino
 * entero, o el prefijo de 8 del enlace corto.
 */
export function claveDeTramo(tramo: string): { id?: string; prefijo?: string } {
  const valor = String(tramo ?? "").trim().toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(valor)) return { id: valor };
  // El enlace corto es solo el código; el intermedio traía título y código.
  if (/^[0-9a-f]{8}$/.test(valor)) return { prefijo: valor };
  const encontrado = valor.match(SUFIJO);
  return encontrado ? { prefijo: encontrado[1] } : {};
}

/**
 * El rango de ids que empiezan con ese prefijo. Postgres compara uuid como
 * uuid, así que un `like` no sirve: el rango sí, y no hace falta ninguna
 * columna nueva en la base.
 */
export function rangoDePrefijo(prefijo: string): { desde: string; hasta: string } {
  return {
    desde: `${prefijo}-0000-0000-0000-000000000000`,
    hasta: `${prefijo}-ffff-ffff-ffff-ffffffffffff`,
  };
}

/** ¿Este id corresponde al tramo del enlace? Sirve en el cliente. */
export function idCoincide(id: string, tramo: string): boolean {
  const clave = claveDeTramo(tramo);
  if (clave.id) return id.toLowerCase() === clave.id;
  if (clave.prefijo) return id.toLowerCase().startsWith(clave.prefijo);
  return false;
}
