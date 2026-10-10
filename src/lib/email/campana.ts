/** Legacy campaign identity for historical or untagged provider events.
 * New sends use the stable key in campaign-policy, independent of the subject.
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

/** Brevo sends tags as arrays, plain strings, or JSON-encoded arrays. */
export function campaignFromEvent(event: { tags?: unknown; tag?: unknown; subject?: unknown }) {
  for (const raw of [event.tags, event.tag]) {
    let tags: unknown = raw;
    if (typeof raw === "string" && raw.trim().startsWith("[")) {
      try { tags = JSON.parse(raw); } catch { tags = null; }
    }
    const tag = Array.isArray(tags) ? tags.find((value) => typeof value === "string" && value.trim()) : tags;
    if (typeof tag === "string" && tag.trim()) return tag.trim();
  }
  return typeof event.subject === "string" && event.subject.trim() ? campanaDesdeAsunto(event.subject) : null;
}
