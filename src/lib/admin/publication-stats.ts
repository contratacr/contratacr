import { readAllAdminRows } from "@/lib/admin/read-all-rows";
import type { createAdminClient } from "@/lib/supabase/admin";

// CLICS DE CONTACTO Y VISTAS POR PUBLICACIÓN (panel: empleos, promociones y
// proyectos). Las postulaciones ya no existen: hoy quien se interesa toca
// WhatsApp, y ese clic queda en `interaction_events` con el id de la
// publicación en la metadata (jobId, offerId o project_id/projectId). Se
// cuentan los clics y las personas distintas (visitor_hash), porque diez clics
// de la misma persona no son diez interesados.
//
// Igual que el resto de las estadísticas, solo cuenta a quien aceptó la
// medición, y nunca los clics del propio dueño ni de pruebas automáticas.

export type PublicationStats = {
  views: number;
  whatsapp: { clicks: number; people: number };
  phone: { clicks: number; people: number };
};

type Spec = {
  /** Claves de metadata donde puede venir el id (los proyectos usan dos). */
  keys: string[];
  views: string;
  whatsapp: string;
  phone?: string;
};

export const PUBLICATION_STATS_SPEC: Record<"job" | "offer" | "project", Spec> = {
  job: { keys: ["jobId"], views: "job_view", whatsapp: "whatsapp_click" },
  offer: { keys: ["offerId"], views: "offer_view", whatsapp: "whatsapp_click" },
  project: { keys: ["project_id", "projectId"], views: "project_view", whatsapp: "project_lead_whatsapp", phone: "project_lead_phone" },
};

export const emptyPublicationStats = (): PublicationStats => ({ views: 0, whatsapp: { clicks: 0, people: 0 }, phone: { clicks: 0, people: 0 } });

type EventRow = { id?: string | number; event_type: string; visitor_hash: string | null; viewer_user_id: string | null; metadata: Record<string, unknown> | null };

/** Suma las filas ya leídas. Separado para poder probarlo sin base. */
export function tallyPublicationStats(kind: keyof typeof PUBLICATION_STATS_SPEC, ids: string[], rows: EventRow[]) {
  const spec = PUBLICATION_STATS_SPEC[kind];
  const wanted = new Set(ids);
  const stats = new Map(ids.map((id) => [id, emptyPublicationStats()]));
  const people = new Map<string, Set<string>>();
  for (const row of rows) {
    const id = spec.keys.map((key) => row.metadata?.[key]).find((value): value is string => typeof value === "string" && wanted.has(value));
    if (!id) continue;
    const entry = stats.get(id)!;
    if (row.event_type === spec.views) { entry.views += 1; continue; }
    const channel = row.event_type === spec.whatsapp ? "whatsapp" : spec.phone && row.event_type === spec.phone ? "phone" : null;
    if (!channel) continue;
    entry[channel].clicks += 1;
    const who = row.viewer_user_id || row.visitor_hash;
    if (who) {
      const key = `${id}:${channel}`;
      const seen = people.get(key) ?? new Set<string>();
      seen.add(who);
      people.set(key, seen);
      entry[channel].people = seen.size;
    } else {
      entry[channel].people += 1;
    }
  }
  return stats;
}

/** Lee y suma las estadísticas de las publicaciones de una página del panel. */
export async function readPublicationStats(db: ReturnType<typeof createAdminClient>, kind: keyof typeof PUBLICATION_STATS_SPEC, ids: string[]) {
  const spec = PUBLICATION_STATS_SPEC[kind];
  if (!ids.length) return { data: new Map<string, PublicationStats>(), error: null };
  const types = [spec.views, spec.whatsapp, ...(spec.phone ? [spec.phone] : [])];
  const rows = new Map<string, EventRow>();
  for (const key of spec.keys) {
    const result = await readAllAdminRows<EventRow>((from, to) => db
      .from("interaction_events")
      .select("id, event_type, visitor_hash, viewer_user_id, metadata")
      .in("event_type", types)
      .in(`metadata->>${key}`, ids)
      .order("id").range(from, to) as unknown as PromiseLike<{ data: EventRow[] | null; error: import("@supabase/supabase-js").PostgrestError | null }>);
    if (result.error) return { data: null, error: result.error };
    // Una fila con las dos claves se cuenta una vez.
    for (const row of result.data ?? []) rows.set(String(row.id ?? rows.size), row);
  }
  return { data: tallyPublicationStats(kind, ids, [...rows.values()]), error: null };
}
