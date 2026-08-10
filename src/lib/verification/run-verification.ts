import { createAdminClient } from "@/lib/supabase/admin";
import { getIdentityVerifier } from "@/lib/verification/identity-verifier";
import { notifyVerificationDecision, notifyAppealReceived } from "@/lib/verification-notify";
import { cleanId, detectIdType } from "@/lib/cedula";

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
  opts: {
    appeal?: boolean;
    appealMessage?: string;
    /**
     * "both" (default) = notify by in-app + email; "in_app" = in-app only.
     * Registration passes "in_app" so it doesn't email the verification result
     * (the user is already in the app); later/external changes keep "both".
     */
    notifyChannel?: "both" | "in_app";
    /**
     * First-ever run for a brand-new registration. Forces a notification even
     * if the computed status equals the row's default ("pending"), so the new
     * pro still sees the result once. On re-saves (isInitial=false) we only
     * notify when the status ACTUALLY changes — no duplicate emails/notifs.
     */
    isInitial?: boolean;
  } = {}
): Promise<RunOutcome> {
  const channel = opts.notifyChannel ?? "both";
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

  if (detectIdType(cedula) === "juridica") {
    const now = new Date().toISOString();
    const fromStatus = pro.verification_status as string;
    await admin
      .from("professionals")
      .update({
        verification_status: "pending",
        verification_method: "manual",
        verification_provider: "cedula_juridica",
        verification_updated_at: now,
      })
      .eq("id", professionalId);
    await admin
      .from("profiles")
      .update({
        client_identity_status: "pending",
        client_identity_verified_at: null,
        client_identity_provider: "cedula_juridica",
      })
      .eq("id", pro.profile_id);
    await admin.from("provider_verification_log").insert({
      professional_id: professionalId,
      admin_id: null,
      admin_name: "Verificacion manual",
      action: "legal_entity_pending",
      from_status: fromStatus,
      to_status: "pending",
      reason: "Cedula juridica detectada; requiere revision manual y no se consulta en el padron de personas fisicas.",
    });
    if (fromStatus !== "pending" || opts.isInitial) {
      await notifyVerificationDecision({ professionalId, kind: "pending", channel });
    }
    return "pending";
  }

  const verifier = getIdentityVerifier();
  const result = await verifier.lookup(cedula);
  if (result.unavailable) return "skipped";

  const now = new Date().toISOString();
  const fromStatus = pro.verification_status as string;

  if (result.found) {
    // Source of truth for the name is the padrón. Overwrite the profile name with
    // the official one so a typed mismatch ("Isaac Monge") can never stand. We store the
    // FULL official name (first + middle given names + both surnames — the padrón's
    // nombre/papellido/sapellido via titleCaseName); abbreviation to drop the middle name
    // happens ONLY at display (proDisplayName), never in storage.
    if (result.fullName && result.fullName !== fullName) {
      await admin.from("profiles").update({ full_name: result.fullName }).eq("id", pro.profile_id);
      // Keep Auth's display name (user_metadata.full_name) in sync with the official
      // profile name — the navbar/menu read user_metadata, so without this they'd show the
      // stale registration name. MERGE (spread existing metadata) so role/avatar_url/etc.
      // are never wiped. profiles.id === auth.users.id. Non-fatal: profiles is the truth.
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(pro.profile_id);
        await admin.auth.admin.updateUserById(pro.profile_id, {
          user_metadata: { ...(authUser?.user?.user_metadata ?? {}), full_name: result.fullName },
        });
      } catch { /* ignore — header just keeps the old display name until next sync */ }
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

    await admin
      .from("profiles")
      .update({
        client_identity_status: "verified",
        client_identity_verified_at: now,
        client_identity_provider: result.provider,
      })
      .eq("id", pro.profile_id);
    await admin
      .from("projects")
      .update({ client_identity_status: "verified" })
      .eq("client_id", pro.profile_id)
      .eq("status", "open");

    await admin.from("provider_verification_log").insert({
      professional_id: professionalId,
      admin_id: null,
      admin_name: "Verificación automática",
      action: "auto_verified",
      from_status: fromStatus,
      to_status: "verified",
      reason: `Cédula encontrada en el padrón (${result.provider}); identidad confirmada.`,
    });

    // Only notify when the status actually changed (or it's the first run) so a
    // re-save/edit of an already-verified pro never re-fires the email/notif.
    if (fromStatus !== "verified" || opts.isInitial) {
      await notifyVerificationDecision({ professionalId, kind: "verified", channel });
    }
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
    await admin
      .from("profiles")
      .update({
        client_identity_status: "pending",
        client_identity_verified_at: null,
        client_identity_provider: result.provider,
      })
      .eq("id", pro.profile_id);
    await admin
      .from("projects")
      .update({ client_identity_status: "pending" })
      .eq("client_id", pro.profile_id)
      .eq("status", "open");

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

    await notifyVerificationDecision({ professionalId, kind: "pending", channel });
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

  await admin
    .from("profiles")
    .update({
      client_identity_status: "pending",
      client_identity_verified_at: null,
      client_identity_provider: result.provider,
    })
    .eq("id", pro.profile_id);
  await admin
    .from("projects")
    .update({ client_identity_status: "pending" })
    .eq("client_id", pro.profile_id)
    .eq("status", "open");

  await admin.from("provider_verification_log").insert({
    professional_id: professionalId,
    admin_id: null,
    admin_name: "Verificación automática",
    action: "auto_pending",
    from_status: fromStatus,
    to_status: "pending",
    reason: failReason,
  });

  // Notify only on a real status change (or first run) — avoids re-notifying an
  // already-pending pro who re-saves their registration.
  if (fromStatus !== "pending" || opts.isInitial) {
    await notifyVerificationDecision({ professionalId, kind: "pending", channel });
  }
  return "pending";
}

