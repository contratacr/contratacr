/**
 * El nombre corto de una campaña, derivado de su asunto.
 *
 * Vivía suelto dentro de la ruta de campañas, pero ahora lo necesitan tres
 * lugares: el envío (para no repetirle a nadie), el aviso de Brevo y el
 * rescate de lo que ya salió. Tiene que ser EXACTAMENTE la misma cuenta en los
 * tres, porque es la llave con la que se encuentran las filas.
 */
export function campanaDesdeAsunto(asunto: string) {
  return asunto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "campana";
}

/**
 * Cómo se llama en Brevo cada cosa que nos interesa anotar.
 *
 * El nombre del evento cambia según por dónde llegue: el aviso en vivo dice
 * `click` y `hard_bounce`, y el registro histórico dice `clicks` y
 * `hardBounces`. Las dos formas apuntan a la misma columna.
 */
export const COLUMNA_POR_EVENTO: Record<string, "entregado_en" | "abierto_en" | "click_en" | "rebote_en"> = {
  delivered: "entregado_en",
  opened: "abierto_en",
  unique_opened: "abierto_en",
  uniqueOpened: "abierto_en",
  click: "click_en",
  clicks: "click_en",
  hard_bounce: "rebote_en",
  hardBounces: "rebote_en",
  spam: "rebote_en",
  blocked: "rebote_en",
};
