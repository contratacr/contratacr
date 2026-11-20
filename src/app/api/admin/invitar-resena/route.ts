import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { invitarAResenaDeGoogle } from "@/lib/notifications/invitacion-resena-google";
import { cuentasConExperiencia } from "@/lib/notifications/invitar-tras-experiencia";
import { hasRecentOnceReceipt, ONCE_NOTIFICATION_TYPES, onceReceipts } from "@/lib/notifications/once";

export const dynamic = "force-dynamic";

async function estado() {
  const db = createAdminClient();
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("profiles").select("id").eq("is_disabled", false).order("id").range(from, from + 999);
    if (error) throw error;
    ids.push(...(data ?? []).map((row) => row.id));
    if ((data ?? []).length < 1000) break;
  }
  const [recibos, experiencia] = await Promise.all([
    onceReceipts(db, ids, [...ONCE_NOTIFICATION_TYPES]), cuentasConExperiencia(db),
  ]);
  const activas = new Set(ids);
  const google = recibos.filter((r) => r.type === "resena_google");
  const bloqueadas = new Set(google.map((r) => r.user_id));
  const pendientes = [...new Set(experiencia)].filter((id) => activas.has(id) && !bloqueadas.has(id) && !hasRecentOnceReceipt(recibos, id));
  return {
    db, pendientes,
    resumen: {
      cuentas: ids.length,
      yaTienen: google.filter((r) => r.status === "sent").length,
      historialSinConfirmar: google.filter((r) => r.status === "historical_unknown").length,
      restantes: pendientes.length,
    },
  };
}

export async function GET() {
  if (!await getApiAdmin()) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  try {
    return NextResponse.json((await estado()).resumen);
  } catch {
    return NextResponse.json({ error: "No se pudo comprobar el historial de invitaciones. No se enviará nada sin verificarlo." }, { status: 503 });
  }
}

export async function POST() {
  if (!await getApiAdmin()) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  try {
    const { db, pendientes } = await estado();
    const resultado = await invitarAResenaDeGoogle(db, pendientes);
    return NextResponse.json({ ok: true, ...resultado, ...(await estado()).resumen });
  } catch {
    return NextResponse.json({ error: "No se pudo completar el envío. Actualiza el estado antes de reintentar; las invitaciones guardadas no se repetirán." }, { status: 503 });
  }
}
