import { hasVerificationDocuments } from "@/lib/verification/documents";
import { cleanId, detectIdType } from "@/lib/cedula";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandedEmailDocument, sendBrevoEmail, type EmailResult } from "@/lib/email/send";
import { shouldEmailVerificationDecision } from "@/lib/verification/email-policy";
import { sendNotificationPush } from "@/lib/push/notify";

const PRO_LINK = "/dashboard/profesional?tab=verificacion";

type DecisionKind = "verified" | "pending" | "rejected" | "reverted";

interface DecisionArgs {
  professionalId: string;
  kind: DecisionKind;
  /** Required for "rejected": the stated reason. */
  reason?: string | null;
  /**
   * Which channels to notify on. "both" (default) = in-app + email; "in_app"
   * = in-app notification only (no email). At REGISTRATION we use "in_app" —
   * the user is already in the app and sees the bell immediately, so the email
   * is redundant. For changes that happen later/outside the app (admin
   * decision, appeal, add-cédula) we use "both" because time has passed and the
   * user may not be online.
   */
  channel?: "both" | "in_app";
}

/**
 * Notify a provider that their identity-verification status changed — in-app and
 * (optionally) email. Best-effort: notification failures must never break the flow.
 * Legal framing: the badge confirms IDENTITY only (the cédula is real and the
 * name matches official records); it never endorses job quality or outcomes.
 * Copy avoids "garantía" / "autorizado".
 */
export async function notifyVerificationDecision({
  professionalId,
  kind,
  reason,
  channel = "both",
}: DecisionArgs): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: pro } = await admin
      .from("professionals")
      .select("profile_id, verification_updated_at, profiles(full_name, email)")
      .eq("id", professionalId)
      .maybeSingle();
    if (!pro) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = pro.profiles as any;
    const firstName = (profile?.full_name ?? "profesional").split(" ")[0];
    const email: string | undefined = profile?.email;

    let type: string;
    let title: string;
    let message: string;
    let html: string;

    if (kind === "verified") {
      type = "verification_approved";
      title = "¡Tu identidad fue verificada!";
      message =
        "Verificamos tu identidad. El check azul ya aparece junto a tu nombre.";
      html = emailShell(
        firstName,
        "¡Tu identidad fue verificada!",
        "#16a34a",
        `Verificamos tu identidad. El <strong>check azul</strong> ya aparece junto a tu nombre.`,
        "Ver mi verificación"
      );
    } else if (kind === "pending") {
      type = "verification_pending";
      title = "Tu verificación está en revisión";
      message =
        "No se completó la verificación automática de los datos o falta revisar la representación de tu empresa. Puedes solicitar revisión manual desde tu panel; tu cuenta sigue activa.";
      html = emailShell(
        firstName,
        "Tu verificación está en revisión",
        "#b45309",
        `No se completó el cotejo automático de tus datos con Hacienda o falta revisar la representación de tu empresa.
         Puedes <strong>solicitar revisión manual</strong> y adjuntar los documentos desde tu panel. Tu cuenta sigue activa mientras tanto.`,
        "Ver mi verificación"
      );
    } else if (kind === "rejected") {
      type = "verification_rejected";
      title = "Tu verificación no fue aprobada";
      const safeReason = reason?.trim() || "No se especificó un motivo.";
      message = `Tu verificación de identidad no fue aprobada. Motivo: ${safeReason}. Puedes apelar desde tu panel.`;
      html = emailShell(
        firstName,
        "Tu verificación no fue aprobada",
        "#dc2626",
        `Revisamos tu verificación de identidad y por ahora no fue aprobada.
         <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;margin:16px 0;font-size:14px;color:#991b1b;"><strong>Motivo:</strong> ${escapeHtml(safeReason)}</div>
         Tu cuenta sigue activa. Entra a <strong>Mi perfil → Verificación</strong> para corregir los datos o pedir ayuda a soporte.`,
        "Revisar mi verificación"
      );
    } else {
      type = "verification_reverted";
      title = "Tu verificación fue actualizada";
      const safeReason = reason?.trim() || "No se especificó un motivo.";
      message = `Tu verificación fue quitada. Motivo: ${compactReason(safeReason)}. Revisa tu panel para ver el detalle.`;
      html = emailShell(
        firstName,
        "Tu verificación fue actualizada",
        "#b45309",
        `Quitamos el <strong>check azul</strong> de tu perfil después de revisar tu verificación.
         <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;margin:16px 0;font-size:14px;color:#92400e;"><strong>Motivo:</strong> ${escapeHtml(safeReason)}</div>
         Tu cuenta sigue activa. Entra a <strong>Mi perfil → Verificación</strong> para ver el motivo y pedir ayuda a soporte.`,
        "Ver mi verificación"
      );
    }

    // 1. In-app (always)
    const notification = {
      user_id: pro.profile_id,
      type,
      title,
      message,
      data: {
        link: PRO_LINK,
        verification_decision: kind,
        ...(reason?.trim() ? { review_reason: reason.trim() } : {}),
      },
    };
    await admin.from("notifications").insert(notification);
    await sendNotificationPush({
      userId: notification.user_id as string,
      title,
      message,
      data: notification.data,
    });

    // Pending stays in the app. Registration does not email the result.
    // Later approval, rejection or removal merits an email.
    if (shouldEmailVerificationDecision(kind, channel)) {
      await sendEmail(email, `${title} — ContrataCR`, html, pro.verification_updated_at ? `verification-decision:${pro.profile_id}:${kind}:${pro.verification_updated_at}` : undefined);
    }
  } catch (err) {
    console.error("[notifyVerificationDecision] failed:", err);
  }
}

/**
 * Notify admins in the app when a provider requests a review.
 */
export async function notifyAppealReceived(
  professionalId: string,
  providerName: string,
  appealMessage: string
): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: admins } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin");

    const rows = (admins ?? []).map((a) => ({
      user_id: a.id,
      type: "verification_appeal_received",
      title: "Nueva apelación de verificación",
      message: `${providerName} apeló su revisión: "${appealMessage.slice(0, 120)}"`,
      data: {
        link: `/admin/proveedores/${professionalId}`,
        provider_name: providerName,
        appeal_message: appealMessage.slice(0, 120),
      },
    }));
    if (rows.length > 0) {
      await admin.from("notifications").insert(rows);
      await Promise.all(rows.map((row) => sendNotificationPush({
        userId: row.user_id,
        title: row.title,
        message: row.message,
        data: row.data,
      })));
    }

    // La cola de Verificación y el aviso del panel son suficientes; no duplicar por correo.
  } catch (err) {
    console.error("[notifyAppealReceived] failed:", err);
  }
}

// ---------------------------------------------------------------------------

async function sendEmail(to: string | undefined, subject: string, html: string, eventKey?: string): Promise<void> {
  await sendBrevoEmail({ to, subject, html, eventKey });
}

function escapeHtml(s: string): string {
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function compactReason(reason: string): string {
  return reason.length > 120 ? `${reason.slice(0, 117).trimEnd()}...` : reason;
}

function emailShell(
  firstName: string,
  headline: string,
  accent: string,
  bodyHtml: string,
  cta?: string | null
): string {
  return brandedEmailDocument({
    title: `${headline} — ContrataCR`,
    bodyHtml: `
      <h1 style="font-size:21px;line-height:1.25;margin:0 0 10px">${headline}</h1>
      <p style="font-size:15px;color:#111827;margin:0 0 8px">Hola ${escapeHtml(firstName)},</p>
      <p style="font-size:14px;color:#374151;line-height:1.65;margin:0 0 24px">${bodyHtml}</p>${cta ? `
      <div style="text-align:center">
        <a href="https://contratacr.com${PRO_LINK}"
           style="display:inline-block;padding:14px 28px;background:${accent};border-radius:12px;color:#fff;font-size:15px;font-weight:700;text-decoration:none">
          ${cta}
        </a>
      </div>` : ""}`,
  });
}

// Initial notice and one 30-day reminder share a durable receipt with the
// scheduled worker and admin button. Unknown pre-rollout history stays held.
export async function notifyVerificationOutreach(professionalId: string): Promise<EmailResult & { sequence?: number }> {
  const admin = createAdminClient();
  const { data: candidate, error: candidateError } = await admin.rpc("verification_email_candidate", { p_professional: professionalId });
  if (candidateError || !candidate?.sequence) return { ok: false, status: "skipped", detail: candidateError ? "history_unavailable" : candidate?.reason ?? "ineligible" };
  const { data: pro, error } = await admin.from("professionals")
    .select("profile_id, profiles(full_name, email, cedula)").eq("id", professionalId).maybeSingle();
  const profile = pro?.profiles as unknown as { full_name?: string; email?: string; cedula?: string } | null;
  if (error || !pro?.profile_id || !profile?.email) return { ok: false, status: "skipped", detail: "ineligible" };
  const documents = await hasVerificationDocuments(pro.profile_id);
  if (documents !== false) return { ok: false, status: "skipped", detail: documents ? "documents_received" : "review_unavailable" };
  const firstName = (profile.full_name ?? "profesional").split(" ")[0];
  const legal = detectIdType(cleanId(profile.cedula ?? "")) === "juridica";
  const reminder = candidate.sequence === 2;
  const instructions = legal
    ? "Para revisar el perfil de la empresa, necesitamos confirmar quién la representa:<br/><br/>" +
      "1. Una personería jurídica vigente o una autorización que podamos validar.<br/>" +
      "2. Una foto de la persona autorizada junto a su documento de identidad, con los datos legibles."
    : "Para confirmar tu identidad, adjunta una foto tuya junto a tu cédula, DIMEX o pasaporte, donde se vea tu rostro y se lean los datos.";
  const result = await sendBrevoEmail({
    to: profile.email, subject: reminder ? "Tu perfil sigue sin verificar" : "Falta poco para verificar tu perfil en ContrataCR",
    html: emailShell(firstName, reminder ? "Todavía puedes verificar tu perfil" : "Verificación de tu perfil", "#009FD9",
      `${reminder ? "Hace al menos un mes te enviamos los pasos para verificarte. " : ""}` +
      "Tu perfil todavía no está verificado.<br/><br/>" +
      instructions + "<br/><br/>Adjunta los documentos desde tu panel. Los revisamos y te avisamos en la app.", "Completar verificación"),
    replyTo: "soporte@contratacr.com", nivel: "masivo", purpose: "verification",
    eventKey: `verification:${pro.profile_id}:${candidate.sequence}`, professionalId,
    verificationSequence: candidate.sequence,
  });
  return { ...result, sequence: candidate.sequence };
}

export async function outreachPendingProfessionals({ simulate = false, limit = 25 } = {}) {
  const admin = createAdminClient();
  const pending: { id: string }[] = [];
  for (let from=0; ; from+=1000) {
    const { data, error } = await admin.from("professionals").select("id")
      .in("verification_status", ["pending", "under_appeal"]).order("id").range(from,from+999);
    if (error) throw error;
    pending.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const result = { pending: pending.length, notified: 0, reminded: 0, queued: 0, historicalHeld: 0, alreadyNotified: 0, failed: 0, eligible: 0, restantes: 0 };
  let processed=0;
  for (const pro of pending) {
    const { data: owner, error: ownerError } = await admin.from("professionals").select("profile_id").eq("id", pro.id).single();
    if (ownerError) throw ownerError;
    const documents = await hasVerificationDocuments(owner.profile_id);
    if (documents === null) throw new Error("Verification review unavailable");
    if (documents) { result.alreadyNotified++; continue; }
    const { data, error } = await admin.rpc("verification_email_candidate", { p_professional: pro.id });
    if (error) throw error;
    if (data?.reason === "historical_hold") { result.historicalHeld++; continue; }
    if (!data?.sequence) { result.alreadyNotified++; continue; }
    result.eligible++;
    if (simulate) continue;
    if (processed>=limit) { result.restantes++; continue; }
    processed++;
    const sent = await notifyVerificationOutreach(pro.id);
    if (sent.detail === "already_accepted") result.alreadyNotified++;
    else if (sent.ok) { if (sent.sequence===2) result.reminded++; else result.notified++; }
    else if (sent.status === "queued") result.queued++;
    else result.failed++;
  }
  return result;
}
