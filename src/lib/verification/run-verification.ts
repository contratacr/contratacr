import { invalidateProfessionalCache } from "@/lib/cache/professional-revision";
import { verifiedProfileName } from "@/lib/verification/profile-name";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIdentityVerifier } from "@/lib/verification/identity-verifier";
import { notifyVerificationDecision, notifyVerificationOutreach } from "@/lib/verification-notify";
import { cleanId } from "@/lib/cedula";

export type RunOutcome = "verified" | "pending" | "ticket" | "skipped";

/** Hacienda checks record data, never age, biometrics, tax compliance or company representation. */
export async function runIdentityVerification(
  professionalId: string,
  opts: { notifyChannel?: "both" | "in_app"; isInitial?: boolean; expectedCedula?: string } = {},
): Promise<RunOutcome> {
  const channel = opts.notifyChannel ?? "both";
  const admin = createAdminClient();
  const { data: pro, error: readError } = await admin.from("professionals")
    .select("id, profile_id, verification_status, is_verified, profiles(full_name, cedula)")
    .eq("id", professionalId).maybeSingle();
  if (readError || !pro) return "skipped";
  // Never take over a human review or replace an existing/manual approval.
  if (pro.verification_status === "verified" || pro.is_verified) return "verified";
  if (pro.verification_status === "under_appeal" || pro.verification_status === "rejected") return "ticket";
  const profile = pro.profiles as unknown as { full_name: string | null; cedula: string | null };
  const cedula = cleanId(profile?.cedula ?? "");
  if (!cedula || (opts.expectedCedula && cedula !== opts.expectedCedula)) return "skipped";
  const [history, cases] = await Promise.all([
    admin.from("provider_verification_log").select("id").eq("professional_id", pro.id)
      .in("action", ["verified", "authorized", "rejected", "reverted_pending", "under_appeal"]).limit(1),
    admin.from("support_tickets").select("id").eq("user_id", pro.profile_id)
      .in("topic", ["verification_documents", "verification_appeal"]).in("status", ["open", "in_progress"]).limit(1),
  ]);
  if (history.error || cases.error) return "skipped";
  if (history.data?.length || cases.data?.length) return "ticket";
  const fullName = profile.full_name ?? "";
  const result = await getIdentityVerifier().lookup(cedula);
  if (result.unavailable) {
    await admin.from("provider_verification_log").insert({
      professional_id: pro.id, admin_id: null, admin_name: "Verificación automática", action: "identity_source_unavailable",
      from_status: pro.verification_status, to_status: pro.verification_status,
      reason: "Hacienda no respondió. Se reintentará; no significa que la identificación sea inválida.",
    });
    return "skipped"; // No rejection, review email or change to a human decision.
  }
  const verified = result.found && !!result.fullName;
  const now = new Date().toISOString();
  const target = verified ? "verified" : "pending";
  const provider = result.provider;
  const reason = "No encontramos esta identificación en Hacienda. Puedes apelar para revisión manual; esto no significa que sea inválida.";
  if (verified && result.fullName) {
    const name = await verifiedProfileName(admin, pro.profile_id, fullName, cedula, result.fullName);
    if (name !== fullName) {
      const { data: updated, error } = await admin.from("profiles").update({ full_name: name })
        .eq("id", pro.profile_id).eq("full_name", fullName).eq("cedula", cedula).select("id").maybeSingle();
      if (error || !updated) return "skipped";
      const { data: account } = await admin.auth.admin.getUserById(pro.profile_id);
      if (account.user) await admin.auth.admin.updateUserById(pro.profile_id, { user_metadata: { ...account.user.user_metadata, full_name: name } });
    }
  }
  const { data: saved, error: updateError } = await admin.from("professionals").update({
    verification_status: target, verification_method: verified ? "automatic" : "manual", verification_provider: provider,
    verification_reason: verified ? null : reason, verified_at: verified ? now : null,
    verification_updated_at: now, is_verified: verified,
  }).eq("id", pro.id).eq("verification_status", pro.verification_status).eq("is_verified", false).select("id").maybeSingle();
  if (updateError || !saved) return "skipped";
  const { error: profileError } = await admin.from("profiles").update({
    client_identity_status: target, client_identity_verified_at: verified ? now : null, client_identity_provider: provider,
  }).eq("id", pro.profile_id).eq("cedula", cedula);
  if (profileError) return "skipped";
  await admin.from("projects").update({ client_identity_status: target }).eq("client_id", pro.profile_id).eq("status", "open");
  await admin.from("provider_verification_log").insert({
    professional_id: pro.id, admin_id: null, admin_name: "Verificación automática",
    action: verified ? "auto_verified" : "auto_pending", from_status: pro.verification_status, to_status: target,
    reason: verified ? "Número, tipo y nombre cotejados con Hacienda. No es una validación biométrica." : reason,
  });
  if (verified) await admin.from("interaction_events").insert({
    event_type: "identity_verified", professional_id: pro.id, viewer_user_id: pro.profile_id, visitor_hash: pro.id,
    source: "api", locale: "es", metadata: { metodo: "automatico", proveedor: provider },
  });
  try { await invalidateProfessionalCache(); } catch { /* Verification persists; public caches expire normally if invalidation fails. */ }
  if (pro.verification_status !== target || opts.isInitial) {
    await notifyVerificationDecision({ professionalId: pro.id, kind: verified ? "verified" : "pending", channel });
    if (!verified && channel === "both") await notifyVerificationOutreach(pro.id);
  }
  return target;
}
