/**
 * CÓMO SE LEE EN LA TARJETA QUIEN CUBRE UNA PROVINCIA O TODO EL PAÍS.
 *
 * Decisión de Isaac (25-nov-2026, sobre la de 13-nov):
 *  - Con una zona buscada, quien tiene un lugar en el mapa (local fijo) lleva
 *    su dirección y el ícono de ubicación, como siempre.
 *  - Todos los demás —cubren la provincia o el país, sin lugar en el mapa— se
 *    leen SOLO con el nombre de lo buscado («Atenas, Alajuela» o «Alajuela»),
 *    sin ícono y sin palabras extra. Nunca «Todo Costa Rica» ni «Provincia de X».
 *  - Quien está ahí solo por videoconsulta lleva además la marca «Videoconsulta».
 *  - Sin zona buscada, quien cubre todo el país dice «Atiende en todo el país».
 * El orden de la lista no depende de esto: primero las reseñas, y la zona
 * solo desempata (query-core.ts, ordenFinal).
 */
export type ClaveDeCobertura = "atiendeTodoElPais";
type Traducir = (clave: ClaveDeCobertura) => string;

/** El lugar que se escribe en la tarjeta: lo buscado, o el país si no se buscó nada. */
export function rotuloDeCobertura(t: Traducir, opciones: { lugarBuscado?: string }) {
  return opciones.lugarBuscado?.trim() || t("atiendeTodoElPais");
}
