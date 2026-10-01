import type { SupabaseClient } from "@supabase/supabase-js";

/** Bucket privado de los adjuntos de soporte (migración 227). */
export const BUCKET_SOPORTE = "support-attachments";
export const MAX_ADJUNTOS_SOPORTE = 3;

export type AdjuntoDeSoporte = { path: string; name: string; type: string; size: number; url?: string | null };

/**
 * Lo que manda el navegador al enviar: solo se aceptan rutas de ESTE ticket
 * (la subida las arma como `<ticket>/...`), sin la url firmada, que caduca.
 */
export function adjuntosValidos(valor: unknown, ticketId: string): AdjuntoDeSoporte[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((a): a is AdjuntoDeSoporte =>
      !!a && typeof a === "object" &&
      typeof (a as AdjuntoDeSoporte).path === "string" &&
      (a as AdjuntoDeSoporte).path.startsWith(`${ticketId}/`) &&
      !(a as AdjuntoDeSoporte).path.includes(".."))
    .slice(0, MAX_ADJUNTOS_SOPORTE)
    .map((a) => ({
      path: a.path,
      name: String(a.name ?? "archivo").slice(0, 120),
      type: String(a.type ?? "application/octet-stream").slice(0, 80),
      size: Number(a.size) || 0,
    }));
}

/** Pone a cada adjunto su enlace firmado (1 h) en una sola llamada. */
export async function firmarAdjuntos<T extends { attachments?: AdjuntoDeSoporte[] | null }>(db: SupabaseClient, mensajes: T[]): Promise<T[]> {
  const rutas = mensajes.flatMap((m) => (m.attachments ?? []).map((a) => a.path));
  if (!rutas.length) return mensajes;
  const { data } = await db.storage.from(BUCKET_SOPORTE).createSignedUrls(rutas, 60 * 60);
  const porRuta = new Map((data ?? []).map((f) => [f.path, f.signedUrl]));
  return mensajes.map((m) => (m.attachments?.length
    ? { ...m, attachments: m.attachments.map((a) => ({ ...a, url: porRuta.get(a.path) ?? null })) }
    : m));
}

/**
 * Al recargar el hilo cada enlace firmado llega NUEVO y la foto se volvería a
 * descargar (parpadeo). Se conserva el enlace que ya se tenía para la misma ruta.
 */
export function conservarEnlaces<T extends { id: string; attachments?: AdjuntoDeSoporte[] | null }>(previos: T[], nuevos: T[]): T[] {
  const enlaces = new Map<string, string>();
  for (const m of previos) for (const a of m.attachments ?? []) if (a.url) enlaces.set(a.path, a.url);
  if (!enlaces.size) return nuevos;
  return nuevos.map((m) => (m.attachments?.length
    ? { ...m, attachments: m.attachments.map((a) => ({ ...a, url: enlaces.get(a.path) ?? a.url })) }
    : m));
}
