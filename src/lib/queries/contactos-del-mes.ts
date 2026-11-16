import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { contactSegment, CONTACT_EVENT_TYPES } from "@/lib/analytics/contact-segments";

/**
 * "12 contactos este mes" en la tarjeta del profesional (15-nov-2026).
 *
 * Es el único dato de actividad que el app SABE y puede mostrar sin inventar:
 * no sabemos si lo contrataron (eso se cierra por WhatsApp), pero sí cuántas
 * personas distintas le escribieron o lo llamaron por sus servicios.
 *
 * - Ventana: los últimos 30 días.
 * - Cuenta PERSONAS, no toques: la misma cuenta (o el mismo visitante anónimo)
 *   que toca WhatsApp tres veces cuenta una vez.
 * - Suma los toques a WhatsApp, llamada y correo desde su perfil, la búsqueda o
 *   sus promociones de servicio, y los chats nuevos dentro del app. No cuenta
 *   cuando es él quien contacta por un proyecto o una vacante.
 * - Los toques del propio profesional ya se descartan al guardarse (migración 257).
 * - Por debajo de MINIMO no se muestra nada: un "1 contacto" no ayuda a nadie y
 *   deja adivinar quién fue.
 */
export const MINIMO_CONTACTOS_VISIBLES = 3;
const DIAS = 30;

export async function contactosDelMes(professionalIds: string[]): Promise<Record<string, number>> {
  const ids = [...new Set(professionalIds.filter(Boolean))];
  if (ids.length === 0) return {};
  try {
    const db = createAdminClient();
    const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString();
    const [eventos, chats] = await Promise.all([
      db.from("interaction_events")
        .select("professional_id,viewer_user_id,visitor_hash,event_type,source,metadata")
        .in("professional_id", ids)
        .in("event_type", [...CONTACT_EVENT_TYPES])
        .gte("created_at", desde)
        .limit(20000),
      db.from("direct_conversations")
        .select("professional_id,client_id")
        .in("professional_id", ids)
        .is("project_id", null)
        .gte("created_at", desde)
        .limit(20000),
    ]);
    const personas = new Map<string, Set<string>>();
    const sumar = (pro: string | null | undefined, quien: string | null) => {
      if (!pro || !quien) return;
      let set = personas.get(pro);
      if (!set) personas.set(pro, (set = new Set()));
      set.add(quien);
    };
    for (const e of eventos.data ?? []) {
      if (contactSegment(e) !== "services") continue;
      sumar(e.professional_id, e.viewer_user_id ? `cuenta:${e.viewer_user_id}` : e.visitor_hash ? `visita:${e.visitor_hash}` : null);
    }
    for (const c of chats.data ?? []) sumar(c.professional_id, c.client_id ? `cuenta:${c.client_id}` : null);
    const resultado: Record<string, number> = {};
    for (const [pro, set] of personas) if (set.size >= MINIMO_CONTACTOS_VISIBLES) resultado[pro] = set.size;
    return resultado;
  } catch (error) {
    // Un dato de adorno nunca tumba la búsqueda.
    console.error("[contactos-del-mes]", error);
    return {};
  }
}
