import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/admin/reports?status=open|resolved|all — moderation queue. Admin-only.
export async function GET(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const status = new URL(req.url).searchParams.get("status") ?? "open";
  const db = createAdminClient();

  let q = db.from("reports").select("*").order("created_at", { ascending: false });
  if (status === "open" || status === "resolved") q = q.eq("status", status);
  const { data: reports } = await q;

  // Para poder suspender desde la misma fila hay que saber si ese profesional YA
  // está suspendido: sin eso el botón diría «Suspender» sobre alguien que ya lo
  // está. Una sola consulta con todos los ids de la vista.
  const ids = Array.from(new Set((reports ?? []).map((r) => r.professional_id).filter(Boolean)));
  const suspendidos = new Map<string, boolean>();
  if (ids.length > 0) {
    const { data: pros } = await db.from("professionals").select("id, is_banned").in("id", ids);
    for (const pro of pros ?? []) suspendidos.set(pro.id as string, (pro as { is_banned?: boolean | null }).is_banned === true);
  }

  const { count: openCount } = await db
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  return NextResponse.json({
    reports: (reports ?? []).map((r) => ({ ...r, professional_banned: r.professional_id ? suspendidos.get(r.professional_id) === true : false })),
    openCount: openCount ?? 0,
  });
}

// PATCH /api/admin/reports — resolve / reopen a report. Admin-only.
export async function PATCH(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id, status } = await req.json();
  if (!id || !["open", "resolved"].includes(status)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const db = createAdminClient();
  const { error } = await db
    .from("reports")
    .update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
// DELETE /api/admin/reports?id=… — removes a report record.
export async function DELETE(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Identificador requerido." }, { status: 400 });
  const db = createAdminClient();
  const { error } = await db.from("reports").delete().eq("id", id);
  if (error) {
    console.error("[admin/reports] delete", error.message);
    return NextResponse.json({ error: "No se pudo eliminar el reporte." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id });
}
