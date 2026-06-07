import { createAdminClient } from "@/lib/supabase/admin";
import { getIdentityVerifier } from "@/lib/verification/identity-verifier";
import { notifyVerificationDecision, notifyAppealReceived } from "@/lib/verification-notify";
import { cleanId } from "@/lib/cedula";

export type RunOutcome = "verified" | "pending" | "ticket" | "skipped";

/**
 * Run automatic identity verification for one professional against the padrón.
 * ROBUST flow (no name-matching): we look up the cédula in the padrón and read
 * the OFFICIAL name from it.
 *  - found  → write the official name onto the profile + grant "Identidad
 *             verificada" automatically (method=automatic). The displayed name
 *             always comes from the padrón, never free text.
 *  - not found → "pendiente de revisión" (never auto-reject). NO permissive
 *             fallback — a cédula absent from the padrón is NEVER auto-verified.
 * Data minimization: we store only this professional's OWN official name + the
 * verification RESULT — never other people's padrón data.
 * Best-effort: returns the outcome; notification failures don't throw.
 */
export async function runIdentityVerification(
  professionalId: string,
  opts: { appeal?: boolean; appealMessage?: string } = {}
): Promise<RunOutcome> {
  const admin = createAdminClient();

  const { data: pro } = await admin
    .from("professionals")
    .select("id, profile_id, verification_status, profiles(full_name, cedula)")
    .eq("id", professionalId)
    .maybeSingle();
  if (!pro) return "skipped";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = pro.profiles as any;
  const cedula = cleanId(profile?.cedula ?? "");
  const fullName: string = profile?.full_name ?? "";
  if (!cedula) return "skipped";

  const verifier = getIdentityVerifier();
  const result = await verifier.lookup(cedula);

  const now = new Date().toISOString();
  const fromStatus = pro.verification_status as string;

  if (result.found) {
    // Source of truth for the name is the padrón. Overwrite the profile name with
    // the official one so a typed mismatch ("Isaac Monge") can never stand.
    if (result.fullName && result.fullName !== fullName) {
      await admin.from("profiles").update({ full_name: result.fullName }).eq("id", pro.profile_id);
    }

    await admin
      .from("professionals")
      .update({
        verification_status: "verified",
        verification_method: "automatic",
        verification_provider: result.provider,
        verification_reason: null,
        verified_at: now,
        verification_updated_at: now,
        is_verified: true,
      })
      .eq("id", professionalId);

    await admin.from("provider_verification_log").insert({
      professional_id: professionalId,
      admin_id: null,
      admin_name: "Verificación automática",
      action: "auto_verified",
      from_status: fromStatus,
      to_status: "verified",
      reason: `Cédula encontrada en el padrón (${result.provider}); identidad confirmada.`,
    });

    await notifyVerificationDecision({ professionalId, kind: "verified" });
    return "verified";
  }

  const failReason = "Cédula no encontrada en el padrón.";

  // Appeal that STILL fails → under_appeal + support ticket (the rare tail the
  // owner resolves manually). Never auto-reject; never silently drop.
  if (opts.appeal) {
    await admin
      .from("professionals")
      .update({ verification_status: "under_appeal", verification_method: "automatic", verification_provider: result.provider, verification_updated_at: now })
      .eq("id", professionalId);

    await admin.from("provider_verification_log").insert({
      professional_id: professionalId, admin_id: null, admin_name: "Apelación (re-ejecución automática)",
      action: "appeal_failed", from_status: fromStatus, to_status: "under_appeal", reason: failReason,
    });

    await admin.from("support_tickets").insert({
      professional_id: professionalId,
      type: "verification",
      subject: "Apelación de verificación falló dos veces",
      detail: `${failReason}${opts.appealMessage ? `\n\nMensaje del proveedor: ${opts.appealMessage}` : ""}`,
    });

    await notifyVerificationDecision({ professionalId, kind: "pending" });
    await notifyAppealReceived(professionalId, fullName, opts.appealMessage ?? failReason);
    return "ticket";
  }

  // First-pass failure → pending manual review (never auto-reject).
  await admin
    .from("professionals")
    .update({
      verification_status: "pending",
      verification_method: "automatic",
      verification_provider: result.provider,
      verification_updated_at: now,
    })
    .eq("id", professionalId);

  await admin.from("provider_verification_log").insert({
    professional_id: professionalId,
    admin_id: null,
    admin_name: "Verificación automática",
    action: "auto_pending",
    from_status: fromStatus,
    to_status: "pending",
    reason: failReason,
  });

  await notifyVerificationDecision({ professionalId, kind: "pending" });
  return "pending";
}
