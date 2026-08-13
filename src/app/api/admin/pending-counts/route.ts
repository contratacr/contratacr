import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/admin/pending-counts — ONE call that returns the "needs attention"
// count for every admin section that has an actionable queue, so the sidebar can
// show a consistent pending badge next to EACH section (not just Soporte). Polled
// by AdminShell. Admin-only.
//
// Sections covered:
//  • verificacion  — account identity awaiting review: professionals pending/appeal
//                    plus client-only profiles with client_identity_status=pending.
//  • reportes      — open moderation reports.
//  • categorias    — user-suggested categories awaiting review ("¿No ves tu categoría?").
//  • soporte       — open tickets + in_progress ones whose last reply was the USER's
//                    (same "needsAttention" definition the Soporte view uses).
export async function GET() {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const db = createAdminClient();

  const [verificacionPros, pendingClientProfiles, proProfiles, reportes, categorias, supportOpen, supportAwaiting, accountDeletions] = await Promise.all([
    db.from("professionals").select("id", { count: "exact", head: true }).in("verification_status", ["pending", "under_appeal"]),
    db.from("profiles").select("id").eq("client_identity_status", "pending"),
    db.from("professionals").select("profile_id"),
    db.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("category_suggestions").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "in_progress").eq("last_reply_role", "user"),
    db.from("account_deletion_requests").select("id", { count: "exact", head: true }).in("status", ["pending", "processing", "failed"]),
  ]);

  const proProfileIds = new Set((proProfiles.data ?? []).map((row) => row.profile_id).filter(Boolean));
  const clientOnlyPending = (pendingClientProfiles.data ?? []).filter((row) => !proProfileIds.has(row.id)).length;

  return NextResponse.json({
    verificacion: (verificacionPros.count ?? 0) + clientOnlyPending,
    reportes: reportes.count ?? 0,
    categorias: categorias.count ?? 0,
    soporte: (supportOpen.count ?? 0) + (supportAwaiting.count ?? 0),
    cuentas: accountDeletions.count ?? 0,
  });
}
