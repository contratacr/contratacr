export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Las oportunidades que el profesional descartó. Se guardan por cuenta, no por
// teléfono, así el "No me interesa" vale en todos sus dispositivos.

async function quienSoy() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: pro } = await admin.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
  if (!pro) return null;
  return { admin, proId: pro.id as string };
}

function tablaFalta(message?: string | null) {
  return /relation .*dismissed_opportunities.* does not exist|Could not find the table|schema cache/i.test(message ?? "");
}

export async function GET() {
  const yo = await quienSoy();
  if (!yo) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const { data, error } = await yo.admin.from("dismissed_opportunities").select("project_id").eq("professional_id", yo.proId);
  if (error) {
    // Sin la migración aplicada, el panel sigue funcionando con lo local.
    if (tablaFalta(error.message)) return NextResponse.json({ projectIds: [], unavailable: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ projectIds: (data ?? []).map((r) => r.project_id) });
}

export async function POST(req: NextRequest) {
  const yo = await quienSoy();
  if (!yo) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.projectIds) ? body.projectIds : typeof body.projectId === "string" ? [body.projectId] : [];
  const limpios = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200);
  if (limpios.length === 0) return NextResponse.json({ error: "Falta la solicitud." }, { status: 400 });
  const { error } = await yo.admin
    .from("dismissed_opportunities")
    .upsert(limpios.map((project_id) => ({ professional_id: yo.proId, project_id })), { onConflict: "professional_id,project_id", ignoreDuplicates: true });
  if (error) {
    if (tablaFalta(error.message)) return NextResponse.json({ success: false, unavailable: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
