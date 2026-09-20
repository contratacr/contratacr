/**
 * CUÁNDO MERECE LA PENA UN FILTRO.
 *
 * Un filtro solo sirve si hay de dónde escoger. Con nueve promociones, cinco
 * empleos y cero proyectos —lo que hay hoy en producción— «Última semana» no
 * acota nada: esconde resultados y le da al tablero pinta de tener más de lo
 * que tiene.
 *
 * Con este umbral los filtros aparecen SOLOS cuando el tablero crece, sin que
 * nadie tenga que acordarse de volver a encenderlos.
 *
 * La fecha va aparte: los tableros ya vienen ordenados por lo más reciente, así
 * que filtrar por fecha solo QUITA. Vuelve con bastante más volumen.
 */
export const USAR_FILTROS_DESDE = 12;
export const USAR_FECHA_DESDE = 30;

/** ¿Vale la pena mostrar los filtros de este tablero? */
export function conFiltros(total: number) {
  return total >= USAR_FILTROS_DESDE;
}

/** ¿Y el de fecha, que solo quita sobre una lista ya ordenada por reciente? */
export function conFiltroDeFecha(total: number) {
  return total >= USAR_FECHA_DESDE;
}
