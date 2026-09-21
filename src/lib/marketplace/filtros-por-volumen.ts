/**
 * EL FILTRO DE FECHA, SOLO CON VOLUMEN.
 *
 * Los tableros ya vienen ordenados por lo más reciente, así que filtrar por
 * fecha no ACOTA: solo QUITA. Con nueve promociones, cinco empleos y cero
 * proyectos —lo que hay hoy en producción— elegir «última semana» deja el
 * tablero vacío y parece que no hay nada. Vuelve solo cuando haya de sobra, sin
 * que nadie tenga que acordarse de encenderlo.
 *
 * Los demás filtros NO se deciden por volumen sino por si ayudan a escoger:
 * «Modalidad» o «Tipo de empleo» sirven con cinco vacantes; «Tipo de promoción»
 * no servía con ninguna cantidad, porque era vocabulario de quien publica.
 */
export const USAR_FECHA_DESDE = 30;

/** ¿Y el de fecha, que solo quita sobre una lista ya ordenada por reciente? */
export function conFiltroDeFecha(total: number) {
  return total >= USAR_FECHA_DESDE;
}
