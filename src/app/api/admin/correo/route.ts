import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { resumenDeCuota } from "@/lib/email/cuota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cuánto correo queda hoy. Isaac lo mira para decidir si vale la pena pagar el
 * plan: si ya se gastaron los del día y hay una campaña esperando, el número
 * es el argumento.
 */
export async function GET() {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  try {
    return NextResponse.json(await resumenDeCuota(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No pudimos leer el contador de correo." }, { status: 500 });
  }
}
