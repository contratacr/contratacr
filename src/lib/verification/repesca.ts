import { createAdminClient } from "@/lib/supabase/admin";
import { runIdentityVerification } from "@/lib/verification/run-verification";

/**
 * Repesca a quien quedó «pendiente de revisión» porque Hacienda no contestó.
 *
 * El fallo era silencioso: `runIdentityVerification` devolvía "skipped" y nadie
 * lo miraba, así que el profesional se quedaba en 'pending' —el valor con el que
 * nace la fila— para siempre, con la misma cara que una cédula de verdad no
 * encontrada. Esto lo vuelve a intentar una vez al día.
 *
 * Solo toca a quien NUNCA llegó a una decisión: si Hacienda sí lo revisó, hay
 * una fila `auto_pending` (o `authorized`/`rejected`) en el historial y ese caso
 * es de Isaac, no de un reintento automático.
 */
const DECISIONES_REALES = ["auto_verified", "verified", "reverted_pending", "auto_pending", "authorized", "rejected", "under_appeal", "appeal_failed", "legal_entity_pending"];
const POR_TANDA = 50;

export async function repescarVerificacionesSinRespuesta(opts: { simular?: boolean } = {}): Promise<{
  simulado: boolean;
  revisados: number;
  verificados: number;
  siguenPendientes: number;
  padronSigueCaido: number;
}> {
  const admin = createAdminClient();

  const { data: pendientes } = await admin
    .from("professionals")
    .select("id, verification_status, profiles(cedula)")
    .eq("verification_status", "pending")
    .limit(500);

  const candidatos: string[] = [];
  for (const pro of pendientes ?? []) {
    if (!(pro.profiles as unknown as { cedula?: string } | null)?.cedula) continue;
    const { data: historial, error: historyError } = await admin
      .from("provider_verification_log")
      .select("action")
      .eq("professional_id", pro.id)
      .in("action", DECISIONES_REALES)
      .limit(1);
    // Con una decisión real en el historial no se toca: ya lo revisó Hacienda
    // (o un humano) y el caso es de la cola de Isaac.
    if (historyError) continue; // Never assume absence of a human decision when history is unavailable.
    if ((historial ?? []).length === 0) candidatos.push(pro.id);
    if (candidatos.length >= POR_TANDA) break;
  }

  const deadline = Date.now() + 40_000;
  let revisados = 0;
  let verificados = 0;
  let siguenPendientes = 0;
  let padronSigueCaido = 0;

  // Simulación: se le PREGUNTA a Hacienda pero no se escribe nada. Verificar
  // concede la insignia y reemplaza el nombre del perfil por el oficial; antes
  // de hacerle eso a gente de verdad conviene ver el número.
  if (opts.simular) {
    const { getIdentityVerifier } = await import("@/lib/verification/identity-verifier");
    const verificador = getIdentityVerifier();
    for (const id of candidatos) {
      if (Date.now() >= deadline) break;
      if (revisados) await new Promise(resolve => setTimeout(resolve, 250));
      revisados++;
      const pro = (pendientes ?? []).find((p) => p.id === id);
      const salida = await verificador.lookup(String((pro?.profiles as unknown as { cedula?: string } | null)?.cedula ?? ""));
      if (salida.unavailable) padronSigueCaido += 1;
      else if (salida.found && !!salida.fullName) verificados += 1;
      else siguenPendientes += 1;
    }
    return { simulado: true, revisados, verificados, siguenPendientes, padronSigueCaido };
  }

  for (const id of candidatos) {
    if (Date.now() >= deadline) break;
    if (revisados) await new Promise(resolve => setTimeout(resolve, 250));
    revisados++;
    // Sin `isInitial`: si el resultado no cambia nada, no se le vuelve a avisar
    // a alguien que ya recibió su aviso el día del registro.
    const salida = await runIdentityVerification(id, { notifyChannel: "in_app" });
    if (salida === "verified") verificados += 1;
    else if (salida === "skipped") padronSigueCaido += 1;
    else siguenPendientes += 1;
  }

  return { simulado: false, revisados, verificados, siguenPendientes, padronSigueCaido };
}
