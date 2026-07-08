import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyVerificationDecision } from "@/lib/verification-notify";
import type { VerificationStatus } from "@/lib/verification";

type Action = "verify" | "reject" | "revert_pending";

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

  const db = createAdminClient();
  const { data: profile, error: profileReadErr } = await db
    .from("profiles")
    .select("id, cedula, client_identity_status")
    .eq("id", id)
    .maybeSingle();

  if (profileReadErr) {
    console.error("[admin/user-identity] profile read error:", profileReadErr);
    return NextResponse.json({ error: "No se pudo cargar la cuenta." }, { status: 500 });
  }
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });

  const { data: professionals, error: professionalsErr } = await db
    .from("professionals")
    .select("id, verification_status")
    .eq("profile_id", id);

  if (professionalsErr) {
    console.error("[admin/user-identity] professionals read error:", professionalsErr);
    return NextResponse.json({ error: "No se pudieron cargar sus perfiles profesionales." }, { status: 500 });
  }

  const hasVerifiedProfessional = (professionals ?? []).some((pro) => pro.verification_status === "verified");
  const removingVerifiedIdentity =
    action === "revert_pending" && (profile.client_identity_status === "verified" || hasVerifiedProfessional);
  if (action === "reject" && !reason) {
    return NextResponse.json({ error: "Debes indicar el motivo del rechazo." }, { status: 400 });
  }
  if (removingVerifiedIdentity && !reason) {
    return NextResponse.json({ error: "Debes indicar el motivo para quitar la verificación." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const accountIdentityStatus = action === "verify" ? "verified" : action === "reject" ? "unverified" : "pending";
  const professionalStatus: VerificationStatus =
    action === "verify" ? "verified" : action === "reject" ? "rejected" : "pending";
  const decisionReason = action === "reject" || removingVerifiedIdentity ? reason : null;

  const profileUpdate: Record<string, unknown> = {
    client_identity_status: accountIdentityStatus,
    client_identity_verified_at: action === "verify" ? now : null,
    client_identity_provider: action === "verify" ? "manual" : null,
  };
  if (action !== "verify") profileUpdate.cedula = null;

  const { data: updatedProfile, error: profileErr } = await db
    .from("profiles")
    .update(profileUpdate)
    .eq("id", id)
    .select("id, cedula")
    .maybeSingle();

  if (profileErr) {
    console.error("[admin/user-identity] profile update error:", profileErr);
    return NextResponse.json({ error: "No se pudo actualizar la verificación de la cuenta." }, { status: 500 });
  }

  if (action !== "verify" && updatedProfile?.cedula) {
    return NextResponse.json({ error: "La verificación cambió, pero la identificación guardada no se limpió. Intenta de nuevo." }, { status: 500 });
  }

  if ((professionals ?? []).length > 0) {
    const { error: proErr } = await db
      .from("professionals")
      .update({
        verification_status: professionalStatus,
        verification_reason: decisionReason,
        verification_method: "manual",
        verification_updated_at: now,
        verified_at: professionalStatus === "verified" ? now : null,
        is_verified: professionalStatus === "verified",
      })
      .eq("profile_id", id);

    if (proErr) {
      console.error("[admin/user-identity] professional sync error:", proErr);
      return NextResponse.json({ error: "Se actualizó la cuenta, pero no se pudo sincronizar el perfil profesional." }, { status: 500 });
    }

    await db.from("provider_verification_log").insert(
      professionals!.map((pro) => ({
        professional_id: pro.id,
        admin_id: admin.id,
        admin_name: admin.fullName,
        action: action === "verify" ? "verified" : action === "reject" ? "rejected" : "reverted_pending",
        from_status: pro.verification_status,
        to_status: professionalStatus,
        reason: decisionReason,
      })),
    );

    await Promise.all(
      professionals!.map((pro) => {
        const notifyKind: "verified" | "pending" | "rejected" | "reverted" =
          action === "verify"
            ? "verified"
            : action === "reject"
              ? "rejected"
              : pro.verification_status === "verified" || removingVerifiedIdentity
                ? "reverted"
                : "pending";
        return notifyVerificationDecision({ professionalId: pro.id, kind: notifyKind, reason: decisionReason });
      }),
    );
  }

  if (action !== "verify") {
    const { data: authUser } = await db.auth.admin.getUserById(id);
    const userMetadata = { ...(authUser.user?.user_metadata ?? {}) };
    delete userMetadata.cedula;
    delete userMetadata.identity_status;

    const { error: authErr } = await db.auth.admin.updateUserById(id, {
      user_metadata: {
        ...userMetadata,
        identity_status: accountIdentityStatus,
      },
    });

    if (authErr) {
      console.error("[admin/user-identity] auth sync error:", authErr);
      return NextResponse.json({ error: "Se actualizó la cuenta, pero no se pudo limpiar la identificación guardada." }, { status: 500 });
    }
  }

  const { error: projectsErr } = await db
    .from("projects")
    .update({ client_identity_status: accountIdentityStatus })
    .eq("client_id", id)
    .eq("status", "open");

  if (projectsErr) {
    console.error("[admin/user-identity] projects identity sync error:", projectsErr);
    return NextResponse.json({ error: "Se actualizó la cuenta, pero no se pudieron sincronizar sus solicitudes abiertas." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: accountIdentityStatus });
}
