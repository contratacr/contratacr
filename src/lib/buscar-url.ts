import { categorySlug, idDesdeDireccion } from "@/lib/data/category-slug";
import { getCantonBySlugOrId, getProvinceBySlugOrId } from "@/lib/data/cr-geography";

/**
 * LA DIRECCIÓN DE UNA BÚSQUEDA SE LEE:
 *
 *   /buscar/construccion/alajuela/grecia
 *
 * y no /buscar?categoria=construccion&provincia=al&canton=al-gr, que es lo
 * que salía en la barra del navegador y en cada WhatsApp reenviado: claves de
 * máquina a la vista, que se leen como un enlace de fraude.
 *
 * Solo el servicio y el lugar van en la ruta —son lo que una persona
 * comparte—; el texto libre (`q`) y los filtros finos (precio, idioma, orden,
 * «cerca de mí», el rectángulo del mapa) se quedan como parámetros detrás.
 * «todos» ocupa el lugar del servicio cuando la búsqueda es solo por lugar
 * (/buscar/todos/alajuela), para que provincia y servicio no se confundan.
 *
 * La página sigue entendiendo la forma con parámetros: el middleware traduce
 * la ruta bonita a esa forma por dentro (reescritura) y manda la forma vieja
 * a la bonita (308), así que nada de lo ya compartido se rompe. Este archivo
 * no importa nada pesado a propósito: el middleware lo corre en el borde.
 */
const SIN_SERVICIO = "todos";
const EN_LA_RUTA = ["categoria", "provincia", "canton"] as const;

export function esRutaDeBusqueda(pathname: string | null | undefined): boolean {
  return /^\/(?:(?:es|en)\/)?buscar(?:\/|$)/.test(pathname ?? "");
}

/** Lo que la ruta bonita dice de la búsqueda, en las claves que la página usa. */
export function filtrosDeRuta(pathname: string | null | undefined): { categoria?: string; provincia?: string; canton?: string } | null {
  const m = /^\/(?:(?:es|en)\/)?buscar\/([^/?#]+)(?:\/([^/?#]+))?(?:\/([^/?#]+))?\/?$/.exec(pathname ?? "");
  if (!m) return null;
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
  return `/buscar${tramos.length ? `/${tramos.join("/")}` : ""}${cadena ? `?${cadena}` : ""}`;
}
