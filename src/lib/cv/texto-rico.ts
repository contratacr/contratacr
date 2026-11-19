/**
 * TEXTO CON FORMATO EN EL CV (19-nov-2026), como la barrita de FlowCV:
 * negrita, viñetas y enlaces. Se guarda como texto simple, legible tal cual:
 *   **negrita**   ·   - viñeta (al inicio de la línea)   ·   [texto](https://…)
 * y un enlace pegado suelto (https://…) también cuenta.
 * La vista previa y el PDF lo dibujan; el texto para pegar en un formulario
 * (lo que lee un filtro automático) sale sin marcas.
 */

export type Trozo = { texto: string; negrita?: boolean; url?: string };
export type LineaRica = { vineta: boolean; trozos: Trozo[] };

const MARCAS = /\*\*(.+?)\*\*|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)])/g;
const VINETA = /^\s*[•\-–]\s*/;

/** Una línea partida en trozos: texto normal, negrita y enlaces. */
export function trozos(linea: string): Trozo[] {
  const salida: Trozo[] = [];
  let desde = 0;
  for (const m of linea.matchAll(MARCAS)) {
    const i = m.index ?? 0;
    if (i > desde) salida.push({ texto: linea.slice(desde, i) });
    if (m[1] !== undefined) salida.push({ texto: m[1], negrita: true });
    else if (m[2] !== undefined) salida.push({ texto: m[2], url: m[3] });
    else salida.push({ texto: m[4], url: m[4] });
    desde = i + m[0].length;
  }
  if (desde < linea.length) salida.push({ texto: linea.slice(desde) });
  return salida.filter((t) => t.texto);
}

/** Sin marcas: «[mi sitio](https://x.com)» queda «mi sitio (https://x.com)». */
export function textoPlano(linea: string): string {
  return trozos(linea).map((t) => (t.url && t.url !== t.texto ? `${t.texto} (${t.url})` : t.texto)).join("");
}

/** Quita la viñeta del inicio, si la hay. */
export const sinVineta = (linea: string) => linea.replace(VINETA, "");

/**
 * El texto en líneas. En un logro cada línea ya es una viñeta (`todoVinetas`);
 * en el resumen o una sección propia, solo las que empiezan con «- ».
 */
export function lineasRicas(texto: string, todoVinetas = false): LineaRica[] {
  return texto.split("\n").map((l) => l.trim()).filter(Boolean)
    .map((l) => ({ vineta: todoVinetas || VINETA.test(l), trozos: trozos(sinVineta(l)) }));
}

/** ¿Lleva negrita o enlaces? Si no, se dibuja como texto corrido de siempre. */
export const tieneFormato = (t: Trozo[]) => t.some((x) => x.negrita || x.url);
