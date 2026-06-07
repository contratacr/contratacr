import { createAdminClient } from "@/lib/supabase/admin";
import { getIdentityVerifier } from "@/lib/verification/identity-verifier";
import { notifyVerificationDecision, notifyAppealReceived } from "@/lib/verification-notify";
import { cleanId } from "@/lib/cedula";

export type RunOutcome = "verified" | "pending" | "ticket" | "skipped";

/**
 * Run automatic identity verification for one professional against the padrón.
 *  - match → grant "Identidad verificada" automatically (method=automatic).
 *  - not found / name mismatch → "pendiente de revisión" (never auto-reject).
 * Data minimization: we store only the RESULT (verified flag, method, provider,
 * timestamp) — never the padrón person data.
 * Best-effort: returns the outcome; notification failures don't throw.
 */
export async function runIdentityVerification(
  professionalId: string,
  opts: { appeal?: boolean; appealMessage?: string } = {}
): Promise<RunOutcome> {
  const admin = createAdminClient();

  const { data: pro } = await admin
    .from("professionals")
    .select("id, verification_status, profiles(full_name, cedula)")
    .eq("id", professionalId)
    .maybeSingle();
  if (!pro) return "skipped";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = pro.profiles as any;
  const cedula = cleanId(profile?.cedula ?? "");
  const fullName: string = profile?.full_name ?? "";
  if (!cedula || !fullName) return "skipped";

  const verifier = getIdentityVerifier();
  const result = await verifier.verify({ cedula, fullName });

  const now = new Date().toISOString();
  const fromStatus = pro.verification_status as string;

  if (result.matched) {
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
      reason: `Coincidencia automática (${result.provider}, score ${result.score.toFixed(2)}).`,
    });

    await notifyVerificationDecision({ professionalId, kind: "verified" });
    return "verified";
  }

  const failReason = result.found
    ? `Cédula encontrada pero el nombre no coincide (score ${result.score.toFixed(2)}).`
    : "Cédula no encontrada en el padrón.";

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
