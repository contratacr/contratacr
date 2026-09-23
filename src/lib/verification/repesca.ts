import { createAdminClient } from "@/lib/supabase/admin";
import { runIdentityVerification } from "@/lib/verification/run-verification";

/**
 * Repesca a quien quedó «pendiente de revisión» porque el padrón no contestó.
 *
 * El fallo era silencioso: `runIdentityVerification` devolvía "skipped" y nadie
 * lo miraba, así que el profesional se quedaba en 'pending' —el valor con el que
 * nace la fila— para siempre, con la misma cara que una cédula de verdad no
 * encontrada. Esto lo vuelve a intentar una vez al día.
 *
 * Solo toca a quien NUNCA llegó a una decisión: si el padrón sí lo revisó, hay
 * una fila `auto_pending` (o `authorized`/`rejected`) en el historial y ese caso
 * es de Isaac, no de un reintento automático.
 */
const DECISIONES_REALES = ["auto_pending", "authorized", "rejected", "under_appeal", "appeal_failed", "legal_entity_pending"];
const POR_TANDA = 50;

export async function repescarVerificacionesSinRespuesta(): Promise<{
  revisados: number;
  verificados: number;
  siguenPendientes: number;
  padronSigueCaido: number;
}> {
  const admin = createAdminClient();

  const { data: pendientes } = await admin
    .from("professionals")
    .select("id, cedula, verification_status")
    .eq("verification_status", "pending")
    .limit(500);

  const candidatos: string[] = [];
  for (const pro of pendientes ?? []) {
    if (!pro.cedula) continue;
    const { data: historial } = await admin
      .from("provider_verification_log")
      .select("action")
      .eq("professional_id", pro.id)
      .in("action", DECISIONES_REALES)
      .limit(1);
    // Con una decisión real en el historial no se toca: ya lo revisó el padrón
    // (o un humano) y el caso es de la cola de Isaac.
    if ((historial ?? []).length === 0) candidatos.push(pro.id);
    if (candidatos.length >= POR_TANDA) break;
  }

  let verificados = 0;
  let siguenPendientes = 0;
  let padronSigueCaido = 0;
  for (const id of candidatos) {
    // Sin `isInitial`: si el resultado no cambia nada, no se le vuelve a avisar
    // a alguien que ya recibió su aviso el día del registro.
    const salida = await runIdentityVerification(id, { notifyChannel: "in_app" });
    if (salida === "verified") verificados += 1;
    else if (salida === "skipped") padronSigueCaido += 1;
    else siguenPendientes += 1;
  }

  return { revisados: candidatos.length, verificados, siguenPendientes, padronSigueCaido };
}
