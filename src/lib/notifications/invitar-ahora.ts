import { createAdminClient } from "@/lib/supabase/admin";
import { invitarAResenaDeGoogle } from "@/lib/notifications/invitacion-resena-google";

/**
 * LA INVITACIÓN A RESEÑAR EN GOOGLE, EN EL MOMENTO (decisión de Isaac,
 * 3-oct-2026): justo después de una interacción real —publicar un proyecto,
 * un empleo o una promoción, contactar a un profesional, escribir por el chat,
 * hacer una cotización o dejar una reseña—, no al día siguiente.
 * Una sola vez por cuenta (lo garantiza invitarAResenaDeGoogle). Nunca puede
 * tumbar la acción que la dispara: cualquier fallo se traga.
 * El trabajo diario (resena-google.yml) queda de red de seguridad para lo que
 * no pasa por aquí, como una llamada registrada por la analítica.
 */
export async function invitarAResenaAhora(cuentaId: string | null | undefined): Promise<void> {
  if (!cuentaId) return;
  try {
    await invitarAResenaDeGoogle(createAdminClient(), [cuentaId]);
  } catch {
    /* la invitación es un extra */
  }
}
