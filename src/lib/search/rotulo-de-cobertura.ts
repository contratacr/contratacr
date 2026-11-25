/**
 * CÓMO SE LEE EN LA TARJETA QUIEN CUBRE UNA PROVINCIA O TODO EL PAÍS.
 *
 * Decisión de Isaac (25-nov-2026, sobre la de 13-nov):
 *  - Con una zona buscada, quien cubre la provincia o todo el país se lee con
 *    el NOMBRE DE LO BUSCADO («Atenas, Alajuela» o «Alajuela»), igual que quien
 *    tiene solo ese lugar. Nunca «Todo Costa Rica» ni «Provincia de X».
 *  - Para no confundirlo con quien tiene local ahí, lleva una marca corta y
 *    sin ícono de ubicación: «A domicilio» (solo si su perfil tiene la visita
 *    a domicilio encendida), «Cubre la zona», o «Videoconsulta».
 *  - Sin zona buscada, quien cubre todo el país dice «Atiende en todo el país».
 * El orden de la lista no depende de esto: primero las reseñas, y la zona
 * solo desempata (query-core.ts, ordenFinal).
 */
export type ClaveDeCobertura = "atiendeTodoElPais" | "aDomicilio" | "cubreLaZona" | "videoconsulta";
export type MarcaDeCobertura = Exclude<ClaveDeCobertura, "atiendeTodoElPais">;
type Traducir = (clave: ClaveDeCobertura) => string;

/** El lugar que se escribe en la tarjeta: lo buscado, o el país si no se buscó nada. */
export function rotuloDeCobertura(t: Traducir, opciones: { lugarBuscado?: string }) {
  return opciones.lugarBuscado?.trim() || t("atiendeTodoElPais");
}

/**
 * La marca que acompaña al lugar cuando NO es un local suyo.
 * `domicilio` = su perfil tiene la visita a domicilio encendida de verdad
 * (un dato legado sin ese campo no cuenta: se dice «Cubre la zona»).
 * `porVideo` = la cobertura viene solo de la videoconsulta.
 */
export function marcaDeCobertura(opciones: { domicilio: boolean; porVideo: boolean }): MarcaDeCobertura {
  if (opciones.porVideo) return "videoconsulta";
  return opciones.domicilio ? "aDomicilio" : "cubreLaZona";
}
