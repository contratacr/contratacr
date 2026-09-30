import { categorySlug, idDesdeDireccion } from "@/lib/data/category-slug";
import { getCantonBySlugOrId, getProvinceBySlugOrId } from "@/lib/data/cr-geography";

/**
 * LA DIRECCIÓN DE UNA BÚSQUEDA SE LEE:
 *
 *   /profesionales/construccion/alajuela/grecia
 *
 * La búsqueda vive en su sección, como /empleos y /promociones; hasta el 29 de
 * septiembre de 2026 vivía en /buscar, una palabra que servía igual para
 * empleos, promociones o proyectos. /buscar/… salta aquí con un 308.
 *
 * COMPARTE LA RAÍZ CON LOS PERFILES (/profesionales/juan-perez-k3d9f2a1). Se
 * distinguen así, sin adivinar:
 *   · /profesionales                          → búsqueda
 *   · /profesionales/todos[/…]                → búsqueda (solo por lugar)
 *   · /profesionales/<x>/<provincia>[/<cantón>] → búsqueda: un perfil nunca
 *     lleva provincia detrás (lo suyo es /reservar, /opengraph-image)
 *   · /profesionales/<x>                      → búsqueda SOLO si <x> es un
 *     servicio del catálogo real (el de la base, con los creados desde el
 *     panel); si no, es un perfil. Quien pregunta pasa `esServicio`.
 * Un perfil no puede llamarse como un servicio: todo perfil lleva un sufijo
 * aleatorio de 8 caracteres, y el 29-sep-2026 no había ningún choque.
 *
 * y no /profesionales?categoria=construccion&provincia=al&canton=al-gr, que es lo
 * que salía en la barra del navegador y en cada WhatsApp reenviado: claves de
 * máquina a la vista, que se leen como un enlace de fraude.
 *
 * Solo el servicio y el lugar van en la ruta —son lo que una persona
 * comparte—; el texto libre (`q`) y los filtros finos (precio, idioma, orden,
 * «cerca de mí», el rectángulo del mapa) se quedan como parámetros detrás.
 * «todos» ocupa el lugar del servicio cuando la búsqueda es solo por lugar
 * (/profesionales/todos/alajuela), para que provincia y servicio no se confundan.
 *
 * La página sigue entendiendo la forma con parámetros: el middleware traduce
 * la ruta bonita a esa forma por dentro (reescritura) y manda la forma vieja
 * a la bonita (308), así que nada de lo ya compartido se rompe. Este archivo
 * no importa nada pesado a propósito: el middleware lo corre en el borde.
 */
export const RAIZ_DE_BUSQUEDA = "/profesionales";
export const SIN_SERVICIO = "todos";
const EN_LA_RUTA = ["categoria", "provincia", "canton"] as const;
// La dirección vieja (/buscar/…) y la de hoy. Las dos se leen igual.
const RUTA = /^\/(?:(?:es|en)\/)?(profesionales|buscar)(?:\/([^/?#]+))?(?:\/([^/?#]+))?(?:\/([^/?#]+))?\/?$/;

function tramo(valor: string) {
  try { return decodeURIComponent(valor).toLowerCase(); } catch { return valor.toLowerCase(); }
}

/** ¿Este segundo tramo es una provincia? Entonces lo de antes es un servicio. */
export function esProvinciaDeRuta(valor: string | undefined): boolean {
  return Boolean(valor && getProvinceBySlugOrId(tramo(valor)));
}

/**
 * ¿Esta dirección es la búsqueda? `esServicio` responde por el caso de un solo
 * tramo (/profesionales/techos): recibe la LLAVE del servicio (techos,
 * aire_acondicionado). Sin ella, un solo tramo cuenta como perfil.
 */
export function esRutaDeBusqueda(pathname: string | null | undefined, esServicio?: (id: string) => boolean): boolean {
  const m = RUTA.exec((pathname ?? "").split(/[?#]/)[0]);
  if (!m) return false;
  if (m[1] === "buscar" || !m[2]) return true;
  if (tramo(m[2]) === SIN_SERVICIO) return true;
  if (m[3]) return esProvinciaDeRuta(m[3]);
  return Boolean(esServicio?.(idDesdeDireccion(tramo(m[2]))));
}

/** Lo que la ruta bonita dice de la búsqueda, en las claves que la página usa.
 *  En un perfil (/profesionales/juan-perez-k3d9f2a1) devuelve null: por eso
 *  pide `esServicio`, igual que `esRutaDeBusqueda`. */
export function filtrosDeRuta(pathname: string | null | undefined, esServicio?: (id: string) => boolean): { categoria?: string; provincia?: string; canton?: string } | null {
  if (!esRutaDeBusqueda(pathname, esServicio)) return null;
  const partes = RUTA.exec((pathname ?? "").split(/[?#]/)[0]);
  if (!partes || !partes[2]) return null;
  const m = [partes[0], partes[2], partes[3], partes[4]] as const;
  const salida: { categoria?: string; provincia?: string; canton?: string } = {};
  const servicio = decodeURIComponent(m[1]).toLowerCase();
  if (servicio !== SIN_SERVICIO) salida.categoria = idDesdeDireccion(servicio);
  if (m[2]) {
    const province = getProvinceBySlugOrId(decodeURIComponent(m[2]).toLowerCase());
    if (province) {
      salida.provincia = province.id;
      if (m[3]) {
        const canton = getCantonBySlugOrId(province, decodeURIComponent(m[3]).toLowerCase());
        if (canton) salida.canton = canton.id;
      }
    }
  }
  return salida;
}

/** De los parámetros de siempre a la dirección que se comparte. */
export function rutaDeBusqueda(params: URLSearchParams | Record<string, string | undefined>): string {
  const p = params instanceof URLSearchParams ? params : new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
  const resto = new URLSearchParams(p.toString());
  for (const clave of EN_LA_RUTA) resto.delete(clave);
  const tramos: string[] = [];
  const categoria = p.get("categoria");
  const provinciaValor = p.get("provincia");
  const province = provinciaValor && provinciaValor !== "todas" ? getProvinceBySlugOrId(provinciaValor) : undefined;
  const cantonValor = p.get("canton");
  const canton = province && cantonValor && cantonValor !== "todos" ? getCantonBySlugOrId(province, cantonValor) : undefined;
  if (categoria && categoria !== "todas") tramos.push(categorySlug(categoria));
  else if (province) tramos.push(SIN_SERVICIO);
  if (province) tramos.push(province.slug);
  if (canton?.slug) tramos.push(canton.slug);
  const cadena = resto.toString();
  return `${RAIZ_DE_BUSQUEDA}${tramos.length ? `/${tramos.join("/")}` : ""}${cadena ? `?${cadena}` : ""}`;
}
