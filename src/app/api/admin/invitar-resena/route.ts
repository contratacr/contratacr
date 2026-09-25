import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { invitarAResenaDeGoogle } from "@/lib/notifications/invitacion-resena-google";

export const dynamic = "force-dynamic";

/**
 * Manda la invitación a dejar una reseña en Google a TODAS las cuentas que
 * todavía no la tienen. Se dispara desde el panel y se puede volver a
 * disparar sin miedo: el ayudante se salta a quien ya la recibió, así que
 * pulsarlo dos veces no manda nada dos veces —y sirve para alcanzar a quien
 * se registró después—.
 */
export async function GET() {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const db = createAdminClient();
  const [{ count: cuentas }, { count: yaTienen }] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }).eq("is_disabled", false),
    db.from("notifications").select("id", { count: "exact", head: true }).eq("type", "resena_google"),
  ]);
  return NextResponse.json({ cuentas: cuentas ?? 0, yaTienen: yaTienen ?? 0 });
}

export async function POST() {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const db = createAdminClient();
  const { data } = await db.from("profiles").select("id").eq("is_disabled", false).limit(10_000);
  const ids = (data ?? []).map((fila) => String((fila as { id: string }).id));
  const resultado = await invitarAResenaDeGoogle(db, ids);
  return NextResponse.json({ ok: true, ...resultado, cuentas: ids.length });
}
