import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recolectarPendientes, TIPOS_RECORDATORIO } from "@/lib/recordatorios/inactividad";

// GET /api/admin/pendientes — lo que está detenido ahora mismo, con lo que hace
// falta para decidir si escribirle a alguien: de quién es, cuántos días lleva,
// si el app ya avisó (y cuándo) y si hubo contacto entre las dos partes.
//
// Mira EXACTAMENTE lo mismo que el envío de recordatorios: una sola definición
// de «pendiente», así lo que se ve aquí es lo que se avisó allá.
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const db = createAdminClient();
  const { avisos } = await recolectarPendientes();
  if (!avisos.length) return NextResponse.json({ pendientes: [] });

  const personas = [...new Set(avisos.map((a) => a.user_id))];
  const [{ data: perfiles }, { data: avisados }, { data: conversaciones }] = await Promise.all([
    db.from("profiles").select("id, full_name, email, phone").in("id", personas),
    // Qué se avisó ya, por persona y por cosa: el propio aviso guardado es el
    // registro de que salió, con su fecha.
    db.from("notifications")
      .select("user_id, type, data, created_at, read")
      .in("user_id", personas)
      .in("type", [...TIPOS_RECORDATORIO])
      .order("created_at", { ascending: false }),
    // «¿Ya se hablaron?»: una conversación con al menos un mensaje entre las dos
    // partes es la señal más honesta de que alguien movió el asunto.
    db.from("direct_conversations").select("id, client_id, professional_profile_id, last_message_at"),
  ]);

  const persona = new Map((perfiles ?? []).map((p) => [p.id as string, p]));
  const avisoPrevio = new Map<string, { created_at: string; read: boolean; hito: number }>();
  for (const fila of (avisados ?? []) as Array<{ user_id: string; type: string; data: Record<string, unknown> | null; created_at: string; read: boolean }>) {
    const d = fila.data ?? {};
    const referencia = (d.project_id ?? d.booking_id ?? d.job_id ?? d.quote_id) as string | undefined;
    if (!referencia) continue;
    const clave = `${fila.user_id}|${fila.type}|${referencia}`;
    if (!avisoPrevio.has(clave)) {
      avisoPrevio.set(clave, { created_at: fila.created_at, read: fila.read, hito: Number(d.hito) || 0 });
    }
  }
  const hablaron = new Set<string>();
  for (const c of (conversaciones ?? []) as Array<{ client_id: string; professional_profile_id: string; last_message_at: string | null }>) {
    if (!c.last_message_at) continue;
    hablaron.add(c.client_id);
    hablaron.add(c.professional_profile_id);
  }

  const pendientes = avisos.map((aviso) => {
    const quien = persona.get(aviso.user_id);
    const previo = avisoPrevio.get(`${aviso.user_id}|${aviso.type}|${aviso.referencia}`);
    return {
      tipo: aviso.type,
      titulo: aviso.title,
      detalle: aviso.message,
      dias: aviso.hito,
      referencia: aviso.referencia,
      enlace: typeof aviso.data.link === "string" ? aviso.data.link : null,
      persona: {
        id: aviso.user_id,
        nombre: quien?.full_name ?? null,
        email: quien?.email ?? null,
        telefono: quien?.phone ?? null,
      },
      avisado: previo ? { cuando: previo.created_at, leido: previo.read, hito: previo.hito } : null,
      huboContacto: hablaron.has(aviso.user_id),
    };
  });

  // Lo más viejo primero: es lo que más urge mover.
  pendientes.sort((a, b) => b.dias - a.dias);
  return NextResponse.json({ pendientes });
}
