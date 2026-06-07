import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyVerificationDecision } from "@/lib/verification-notify";
import type { VerificationStatus } from "@/lib/verification";

type Action = "verify" | "reject" | "revert_pending";

// POST /api/admin/providers/[id]/decision  { action, reason? }
// Manual decision on a flagged case. Writes an audit-log entry and notifies the
// provider (in-app + email). Decisions are never locked — an admin can move ANY
// provider to ANY state at any time. Admin-only.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action as Action;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!["verify", "reject", "revert_pending"].includes(action)) {
    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  }
  // A reason is REQUIRED when rejecting.
  if (action === "reject" && !reason) {
    return NextResponse.json({ error: "Debés indicar el motivo del rechazo." }, { status: 400 });
  }

  const db = createAdminClient();

  const { data: pro } = await db
    .from("professionals")
    .select("id, verification_status")
    .eq("id", id)
    .maybeSingle();
  if (!pro) return NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });

  const fromStatus = pro.verification_status as VerificationStatus;

  const toStatus: VerificationStatus =
    action === "verify" ? "verified" : action === "reject" ? "rejected" : "pending";

  const notifyKind: "verified" | "rejected" | "reverted" =
    action === "verify" ? "verified" : action === "reject" ? "rejected" : "reverted";

  const { error: updErr } = await db
    .from("professionals")
    .update({
      verification_status: toStatus,
      verification_reason: action === "reject" ? reason : null,
      verification_method: "manual",
      verification_updated_at: new Date().toISOString(),
      verified_at: toStatus === "verified" ? new Date().toISOString() : null,
      is_verified: toStatus === "verified", // mirror legacy flag
    })
    .eq("id", id);

  if (updErr) {
    console.error("[admin/decision] update error:", updErr);
    return NextResponse.json({ error: "No se pudo guardar la decisión." }, { status: 500 });
  }

  // Audit trail — permanent record of who/when/what/why (manual decision).
  await db.from("provider_verification_log").insert({
    professional_id: id,
    admin_id: admin.id,
    admin_name: admin.fullName,
    action: action === "verify" ? "verified" : action === "reject" ? "rejected" : "reverted_pending",
    from_status: fromStatus,
    to_status: toStatus,
    reason: action === "reject" ? reason : null,
  });

  // Resolve any open support tickets for this pro when manually decided.
  await db
    .from("support_tickets")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("professional_id", id)
    .eq("status", "open");

  // Resolve any open appeals once the case leaves "under_appeal".
  if (fromStatus === "under_appeal") {
    await db
      .from("provider_appeals")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("professional_id", id)
      .eq("status", "open");
  }

  // Notify the provider (best-effort).
  await notifyVerificationDecision({ professionalId: id, kind: notifyKind, reason });

  return NextResponse.json({ ok: true, status: toStatus });
}
