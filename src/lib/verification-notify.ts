import { createAdminClient } from "@/lib/supabase/admin";
import { sendBrevoEmail } from "@/lib/email/send";
import { sendNotificationPush } from "@/lib/push/notify";
import { sendWhatsAppTemplate } from "@/lib/notifications";

const PRO_LINK = "/es/dashboard/profesional?tab=profile&mode=offer&focus=verification";

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
      .select("profile_id, profiles(full_name, email)")
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
        "Confirmamos que tu cédula es real y coincide con los registros oficiales. La insignia \"Verificado\" ya aparece en tu perfil y en los resultados de búsqueda.";
      html = emailShell(
        firstName,
        "¡Tu identidad fue verificada!",
        "#16a34a",
        `Confirmamos que tu cédula es real y el nombre coincide con los registros oficiales. La insignia <strong>Verificado</strong> ya aparece en tu perfil y en los resultados de búsqueda, dándote más visibilidad.
         <br/><br/><span style="color:#6b7280;font-size:13px;">ContrataCR es una plataforma intermediaria: verificamos tu identidad, no la calidad ni el resultado de los trabajos.</span>`,
        "Ver mi verificación"
      );
    } else if (kind === "pending") {
      type = "verification_pending";
      title = "Tu verificación está en revisión";
      message =
        "No pudimos confirmar automáticamente tu identidad (cédula no encontrada o el nombre no coincide). Tu caso quedó en revisión; tu cuenta sigue activa.";
      html = emailShell(
        firstName,
        "Tu verificación está en revisión",
        "#b45309",
        `No pudimos confirmar automáticamente tu identidad contra los registros oficiales (la cédula no se encontró o el nombre no coincidió lo suficiente).
         Tu caso quedó <strong>pendiente de revisión</strong>. Revisa que tu nombre coincida con tu cédula y, si hace falta, apela desde tu panel. Tu cuenta sigue activa mientras tanto.`,
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
         Puedes <strong>apelar</strong> desde tu panel: corrige lo indicado y vuelve a enviar tu caso. Tu cuenta sigue activa y puedes seguir recibiendo clientes.`,
        "Apelar o corregir"
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
        `Tras una nueva revisión, se quitó la insignia <strong>Verificado</strong> de tu perfil.
         <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;margin:16px 0;font-size:14px;color:#92400e;"><strong>Motivo:</strong> ${escapeHtml(safeReason)}</div>
         Entra a tu panel para ver el detalle y los próximos pasos.`,
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

    // 2. Email (Resend) — skipped for "in_app" (e.g. at registration, where the
    // in-app notification is enough and a second email would be redundant).
    if (channel === "both") {
      await sendEmail(email, `${title} — ContrataCR`, html);
    }
  } catch (err) {
    console.error("[notifyVerificationDecision] failed:", err);
  }
}

/**
 * Notify every admin (in-app) + support inbox (email) that a provider appealed.
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
        link: `/es/admin/proveedores/${professionalId}`,
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

    const html = emailShell(
      "equipo",
      "Nueva apelación de verificación",
      "#b45309",
      `<strong>${escapeHtml(providerName)}</strong> apeló la revisión de su perfil.
       <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:16px 0;font-size:14px;color:#374151;">${escapeHtml(appealMessage)}</div>`,
      "Revisar el caso"
    );
    await sendEmail("soporte@contratacr.com", "Nueva apelación de verificación — ContrataCR", html);
  } catch (err) {
    console.error("[notifyAppealReceived] failed:", err);
  }
}

// ---------------------------------------------------------------------------

async function sendEmail(to: string | undefined, subject: string, html: string): Promise<void> {
  await sendBrevoEmail({ to, subject, html });
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
  cta: string
): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4f7fa;border-radius:8px;">
      <div style="background:#1a2744;color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">${headline} — ContrataCR</h2>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p style="font-size:15px;color:#111827;">Hola ${escapeHtml(firstName)},</p>
        <p style="font-size:14px;color:#374151;line-height:1.6;">${bodyHtml}</p>
        <a href="https://contratacr.com${PRO_LINK}"
           style="display:inline-block;background:${accent};color:white;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:8px;font-size:14px;margin-top:8px;">
          ${cta}
        </a>
      </div>
    </div>`;
}

// ── First contact when a professional lands in manual review ─────────────────
// Sent once per account (the in-app notification doubles as the marker):
// in-app + email always, WhatsApp only when an approved Meta template name is
// configured (WHATSAPP_VERIFICATION_TEMPLATE) because business-initiated
// WhatsApp messages cannot be free text. Asks only for what the account does
// not hold yet — never for the name, cédula or phone already on file.
export async function notifyVerificationOutreach(professionalId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: pro } = await admin
      .from("professionals")
      .select("profile_id, whatsapp, category_id, profiles(full_name, email, cedula)")
      .eq("id", professionalId)
      .maybeSingle();
    if (!pro?.profile_id) return;
    const { data: already } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", pro.profile_id)
      .eq("type", "verification_outreach")
      .limit(1);
    if (already && already.length) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = pro.profiles as any;
    const firstName = (profile?.full_name ?? "profesional").split(" ")[0];
    const hasId = !!profile?.cedula;
    const steps = [
      `una foto tuya sosteniendo tu identificación${hasId ? "" : " (cédula, DIMEX o pasaporte)"} junto a tu rostro`,
      "una foto o documento que respalde tu oficio (título, carné, patente o certificado)",
      "una foto de un trabajo reciente",
    ];
    const title = "Para activar tu insignia de verificado";
    const message = `Hola ${firstName}, tu perfil quedó en revisión manual. Para marcarte como verificado necesitamos: 1) ${steps[0]}, 2) ${steps[1]} y 3) ${steps[2]}. Envíalas por WhatsApp o responde a nuestro correo y activamos tu insignia.`;
    const notification = { user_id: pro.profile_id, type: "verification_outreach", title, message, data: { href: PRO_LINK } };
    await admin.from("notifications").insert(notification);
    await sendNotificationPush({ userId: pro.profile_id, title, message, data: notification.data });

    if (profile?.email) {
      const html = emailShell(
        firstName,
        "Verificación de tu perfil",
        "#009FD9",
        `Tu perfil quedó en revisión manual. Para activar la insignia de verificado necesitamos:<br/><br/>` +
          `1) ${escapeHtml(steps[0])}<br/>2) ${escapeHtml(steps[1])}<br/>3) ${escapeHtml(steps[2])}<br/><br/>` +
          `Responde a este correo con las fotos o escríbenos por WhatsApp y te activamos la insignia en cuanto las revisemos.`,
        "Ver mi verificación"
      );
      await sendBrevoEmail({ to: profile.email, subject: "Para activar tu insignia de verificado en ContrataCR", html, replyTo: "soporte@contratacr.com" });
    }

    const template = process.env.WHATSAPP_VERIFICATION_TEMPLATE;
    if (template && pro.whatsapp) {
      const result = await sendWhatsAppTemplate(pro.whatsapp, template, [firstName]);
      if (result.status === "failed") console.warn("[verification] WhatsApp outreach failed", result.detail);
    }
  } catch (error) {
    console.warn("[verification] outreach not sent", error instanceof Error ? error.message : error);
  }
}
