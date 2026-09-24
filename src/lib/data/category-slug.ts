/* LA DIRECCIÓN DE UN SERVICIO, sin depender del catálogo entero.
 *
 * El identificador de un servicio es la llave con la que está guardado TODO en
 * la base (profesionales, promociones, empleos, búsquedas) y lleva guion bajo:
 * `aire_acondicionado`. Como dirección eso es malo: Google usa el guion como
 * separador de palabras y el guion BAJO no, así que leía «aireacondicionado»
 * —algo que nadie busca— en vez de «aire acondicionado». 157 de los 285
 * servicios estaban así. La llave NO se toca; lo que cambia es la dirección.
 *
 * Este archivo va aparte del catálogo a propósito: el middleware necesita
 * traducir la dirección en cada petición, y arrastrar ahí las 1.900 líneas del
 * catálogo engordaría el código que corre en el borde. Aquí no hay más que
 * texto, así que el catálogo lo reexporta y los dos lados dicen lo mismo.
 */

/** Los tres identificadores que la base guardó CORTADOS a 40 caracteres: su
 *  dirección terminaba a media palabra («…colocacion_de_a»). Llevan escrita su
 *  dirección completa. */
export const DIRECCIONES_DE_SERVICIO: Record<string, string> = {
  capacitacion_en_manipulacion_de_alimento: "capacitacion-en-manipulacion-de-alimentos",
  instalacion_de_adoquin_y_colocacion_de_a: "instalacion-de-adoquines",
  instalacion_y_certificacion_de_red_de_gl: "instalacion-de-redes-de-glp",
};

/** La dirección pública de un servicio (lo que va en la URL). */
export function categorySlug(id: string): string {
  return DIRECCIONES_DE_SERVICIO[id] ?? id.replace(/_/g, "-");
}

/** La llave de la base a partir de lo que venga en la dirección, SIN comprobar
 *  que el servicio exista (de eso se encarga el catálogo). Ningún identificador
 *  lleva guion, así que la traducción no puede chocar con otro. */
export function idDesdeDireccion(valor: string): string {
  const escrito = Object.keys(DIRECCIONES_DE_SERVICIO).find((id) => DIRECCIONES_DE_SERVICIO[id] === valor);
  return escrito ?? valor.replace(/-/g, "_");
}
