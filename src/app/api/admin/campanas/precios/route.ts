import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotificationPush } from "@/lib/push/notify";
import { hasAnyPrice, type PricingTier } from "@/lib/pricing";

/**
 * Aviso dentro del app a los profesionales que no publican precio: un toque
 * los lleva a poner su precio de entrada. GET cuenta; POST envía (una vez por
 * cuenta cada 30 días).
 */
async function sinPrecio() {
  const db = createAdminClient();
  const { data } = await db
    .from("professionals")
    .select("id, profile_id, services, pricing, is_banned, verification_status, profiles(is_disabled)")
    .eq("is_banned", false)
    .neq("verification_status", "rejected")
    .limit(2000);
  return (data ?? []).filter((row) => {
    if ((row.profiles as { is_disabled?: boolean } | null)?.is_disabled) return false;
    const services = Array.isArray(row.services) ? (row.services as { priceAmount?: number | null }[]) : [];
    return !!row.profile_id && !hasAnyPrice(services, Array.isArray(row.pricing) ? (row.pricing as PricingTier[]) : null);
  });
}

export async function GET() {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const pros = await sinPrecio();
  return NextResponse.json({ sinPrecio: pros.length });
}

export async function POST() {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const db = createAdminClient();
  const pros = await sinPrecio();
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: recientes } = await db.from("notifications").select("user_id").eq("type", "pricing_request").gte("created_at", desde);
  const yaAvisados = new Set((recientes ?? []).map((n) => n.user_id as string));
  const title = "Pon tu precio de entrada";
  const message = "Los perfiles con precio salen más arriba y reciben más contactos. Es un solo dato: la visita, la hora o tu trabajo mínimo.";
  const data = { link: "/es/dashboard/profesional?mode=offer&tab=services" };
  let enviados = 0, omitidos = 0, fallidos = 0;
  for (const pro of pros) {
    const userId = pro.profile_id as string;
    if (yaAvisados.has(userId)) { omitidos += 1; continue; }
    const { error } = await db.from("notifications").insert({ user_id: userId, type: "pricing_request", title, message, data });
    if (error) { fallidos += 1; if (/notifications_type_check/i.test(error.message)) break; continue; }
    await sendNotificationPush({ userId, title, message, data }).catch(() => undefined);
    enviados += 1;
  }
  console.info(`[campanas/precios] enviados ${enviados}, omitidos ${omitidos}, fallidos ${fallidos} de ${pros.length}`);
  return NextResponse.json({ total: pros.length, enviados, omitidos, fallidos });
}
