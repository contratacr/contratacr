/**
 * «Hace 3 días» — la MISMA cuenta para Proyectos, Promociones y Empleos.
 *
 * Había dos funciones distintas haciendo esto (`cuandoSePublico` en Proyectos y
 * `relativeDate` en Empleos) con redondeos diferentes: una decía «Hace 1 día»
 * donde la otra decía «Ayer», así que la misma antigüedad se leía distinto
 * según la sección. Promociones no decía nada, y sin embargo ofrecía filtrar
 * por «últimas 24 horas»: se filtraba a ciegas, y una promoción de hace cuatro
 * meses se veía igual de vigente que la de ayer.
 *
 * Se trunca, no se redondea: a las 23 h de publicado todavía es «Hace 23 h», no
 * «Ayer». Decir que algo es de ayer cuando es de hoy envejece la publicación.
 */
export const DIAS_VISIBLES = 7;

export function cuandoSePublico(iso: string | null | undefined, en: boolean): string {
  if (!iso) return "";
  const cuando = new Date(iso).getTime();
  if (!Number.isFinite(cuando)) return "";
  const transcurrido = Math.max(0, Date.now() - cuando);
  const minutos = Math.floor(transcurrido / 60_000);
  if (minutos < 1) return en ? "Now" : "Ahora";
  if (minutos < 60) return en ? `${minutos} min ago` : `Hace ${minutos} min`;
  const horas = Math.floor(transcurrido / 3_600_000);
  if (horas < 24) return en ? `${horas} h ago` : `Hace ${horas} h`;
  const dias = Math.floor(transcurrido / 86_400_000);
  // PASADA UNA SEMANA NO SE DICE (3-oct-2026): «Hace 34 días» hacía ver la app
  // abandonada aunque la publicación siga vigente. La fecha solo se muestra
  // cuando juega a favor; quien la pinta oculta el separador si llega vacía.
  if (dias > DIAS_VISIBLES) return "";
  if (dias === 1) return en ? "Yesterday" : "Ayer";
  return en ? `${dias} days ago` : `Hace ${dias} días`;
}
