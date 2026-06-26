import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/admin/pending-counts — ONE call that returns the "needs attention"
// count for every admin section that has an actionable queue, so the sidebar can
// show a consistent pending badge next to EACH section (not just Soporte). Polled
// by AdminShell. Admin-only.
//
// Sections covered:
//  • verificacion  — professionals awaiting review: verification_status pending OR
//                    under_appeal (the manual-review "no tengo identificación" /
//                    "no es mi info" cases land in pending too).
//  • reportes      — open moderation reports.
//  • suscripciones — manual SINPE/transfer payments awaiting approval.
//  • categorias    — user-suggested categories awaiting review ("¿No ves tu categoría?").
//  • soporte       — open tickets + in_progress ones whose last reply was the USER's
//                    (same "needsAttention" definition the Soporte view uses).
export async function GET() {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const db = createAdminClient();

  const [verificacion, reportes, categorias, supportOpen, supportAwaiting] = await Promise.all([
    db.from("professionals").select("id", { count: "exact", head: true }).in("verification_status", ["pending", "under_appeal"]),
    db.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("category_suggestions").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "in_progress").eq("last_reply_role", "user"),
  ]);

  return NextResponse.json({
    verificacion: verificacion.count ?? 0,
    reportes: reportes.count ?? 0,
    suscripciones: 0,
    categorias: categorias.count ?? 0,
    soporte: (supportOpen.count ?? 0) + (supportAwaiting.count ?? 0),
  });
}
