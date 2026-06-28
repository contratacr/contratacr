import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyVerificationDecision } from "@/lib/verification-notify";
import type { VerificationStatus } from "@/lib/verification";

type Action = "verify" | "reject" | "revert_pending";

// POST /api/admin/providers/[id]/decision  { action, reason? }
// Manual decision on a verification case. Identity is account-level: when
// verification is removed, the saved ID is removed from the shared profile too.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action as Action;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!["verify", "reject", "revert_pending"].includes(action)) {
    return NextResponse.json({ error: "Accion invalida." }, { status: 400 });
  }
  if (action === "reject" && !reason) {
    return NextResponse.json({ error: "Debes indicar el motivo del rechazo." }, { status: 400 });
  }

  const db = createAdminClient();

  const { data: pro } = await db
    .from("professionals")
    .select("id, profile_id, verification_status")
    .eq("id", id)
    .maybeSingle();

  if (!pro) return NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });

  const fromStatus = pro.verification_status as VerificationStatus;
  const toStatus: VerificationStatus = action === "verify" ? "verified" : action === "reject" ? "rejected" : "pending";
  const accountIdentityStatus = toStatus === "verified" ? "verified" : action === "reject" ? "unverified" : "pending";
  const notifyKind: "verified" | "rejected" | "reverted" =
    action === "verify" ? "verified" : action === "reject" ? "rejected" : "reverted";
  const now = new Date().toISOString();

  const { error: updErr } = await db
    .from("professionals")
    .update({
      verification_status: toStatus,
      verification_reason: action === "reject" ? reason : null,
      verification_method: "manual",
      verification_updated_at: now,
      verified_at: toStatus === "verified" ? now : null,
      is_verified: toStatus === "verified",
    })
    .eq("id", id);

  if (updErr) {
    console.error("[admin/decision] professional update error:", updErr);
    return NextResponse.json({ error: "No se pudo guardar la decision." }, { status: 500 });
  }

  if (toStatus !== "verified") {
    const { error: clearCedulaErr } = await db
      .from("profiles")
      .update({ cedula: null })
      .eq("id", pro.profile_id);

    if (clearCedulaErr) {
      console.error("[admin/decision] profile cedula cleanup error:", clearCedulaErr);
      return NextResponse.json({ error: "Se actualizo el profesional, pero no se pudo limpiar la identificacion guardada." }, { status: 500 });
    }
  }

  const { data: syncedProfile, error: profileErr } = await db
    .from("profiles")
    .update({
      client_identity_status: accountIdentityStatus,
      client_identity_verified_at: toStatus === "verified" ? now : null,
      client_identity_provider: "manual",
    })
    .eq("id", pro.profile_id)
    .select("id, cedula")
    .maybeSingle();

  if (profileErr) {
    console.error("[admin/decision] profile identity sync error:", profileErr);
    return NextResponse.json({ error: "Se actualizo el profesional, pero no se pudo sincronizar la verificacion de la cuenta." }, { status: 500 });
  }

  if (toStatus !== "verified" && syncedProfile?.cedula) {
    console.error("[admin/decision] profile cedula cleanup did not persist:", { profileId: pro.profile_id });
    return NextResponse.json({ error: "Se actualizo el profesional, pero la identificacion guardada no se limpio. Intenta de nuevo." }, { status: 500 });
  }

  if (toStatus !== "verified") {
    const { data: authUser } = await db.auth.admin.getUserById(pro.profile_id);
    const userMetadata = { ...(authUser.user?.user_metadata ?? {}) };
    delete userMetadata.cedula;
    delete userMetadata.identity_status;

    const { error: authErr } = await db.auth.admin.updateUserById(pro.profile_id, {
      user_metadata: {
        ...userMetadata,
        identity_status: accountIdentityStatus,
      },
    });

    if (authErr) {
      console.error("[admin/decision] auth identity sync error:", authErr);
      return NextResponse.json({ error: "Se actualizo la cuenta, pero no se pudo limpiar la identificacion guardada." }, { status: 500 });
    }
  }

  const { error: projectsErr } = await db
    .from("projects")
    .update({ client_identity_status: accountIdentityStatus })
    .eq("client_id", pro.profile_id)
    .eq("status", "open");

  if (projectsErr) {
    console.error("[admin/decision] open projects identity sync error:", projectsErr);
    return NextResponse.json({ error: "Se actualizo la cuenta, pero no se pudo sincronizar sus solicitudes abiertas." }, { status: 500 });
  }

  await db.from("provider_verification_log").insert({
    professional_id: id,
    admin_id: admin.id,
    admin_name: admin.fullName,
    action: action === "verify" ? "verified" : action === "reject" ? "rejected" : "reverted_pending",
    from_status: fromStatus,
    to_status: toStatus,
    reason: action === "reject" ? reason : null,
  });

  await db
    .from("support_tickets")
    .update({ status: "resolved", resolved_at: now })
    .eq("professional_id", id)
    .eq("status", "open");

  if (fromStatus === "under_appeal") {
    await db
      .from("provider_appeals")
      .update({ status: "resolved", resolved_at: now })
      .eq("professional_id", id)
      .eq("status", "open");
  }

  await notifyVerificationDecision({ professionalId: id, kind: notifyKind, reason });

  return NextResponse.json({ ok: true, status: toStatus });
}
