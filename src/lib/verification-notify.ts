import { createAdminClient } from "@/lib/supabase/admin";

const FROM_ADDRESS = "ContrataCR <soporte@contratacr.com>";
const PRO_LINK = "/es/dashboard/profesional?tab=verificacion";

type DecisionKind = "approved" | "rejected" | "reverted";

interface DecisionArgs {
  professionalId: string;
  kind: DecisionKind;
  /** Required for "rejected": the admin's stated reason. */
  reason?: string | null;
}

/**
 * Notify a provider that their verification status changed — in-app AND email.
 * Best-effort: notification failures must never break the admin action.
 * Legal framing: the badge confirms identity/document verification, it is NOT a
 * guarantee of the outcome of any job. Copy avoids "garantía".
 */
export async function notifyVerificationDecision({
  professionalId,
  kind,
  reason,
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

    if (kind === "approved") {
      type = "verification_approved";
      title = "¡Ya sos Proveedor Autorizado!";
      message =
        "Verificamos tu identidad y documentos. La insignia de Proveedor Autorizado ya aparece en tu perfil y en los resultados de búsqueda.";
      html = emailShell(
        firstName,
        "¡Ya sos Proveedor Autorizado!",
        "#009FD9",
        `Verificamos tu identidad y tus documentos. La insignia <strong>Proveedor Autorizado</strong> ya aparece en tu perfil y en los resultados de búsqueda, dándote más visibilidad ante los clientes.
         <br/><br/><span style="color:#6b7280;font-size:13px;">Recordá que la insignia respalda la verificación de identidad y documentos; no garantiza el resultado de ningún trabajo.</span>`,
        "Ver mi verificación"
      );
    } else if (kind === "rejected") {
      type = "verification_rejected";
      title = "Tu verificación no fue aprobada";
      const safeReason = reason?.trim() || "No se especificó un motivo.";
      message = `Tu solicitud de Proveedor Autorizado no fue aprobada. Motivo: ${safeReason}. Podés apelar esta decisión desde tu panel.`;
      html = emailShell(
        firstName,
        "Tu verificación no fue aprobada",
        "#dc2626",
        `Revisamos tu solicitud de <strong>Proveedor Autorizado</strong> y por ahora no fue aprobada.
         <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;margin:16px 0;font-size:14px;color:#991b1b;"><strong>Motivo:</strong> ${escapeHtml(safeReason)}</div>
         Podés <strong>apelar</strong> esta decisión desde tu panel: corregí lo indicado y volvé a enviar tu caso para una nueva revisión. Tu cuenta sigue activa y podés seguir recibiendo clientes mientras tanto.`,
        "Apelar o corregir"
      );
    } else {
      type = "verification_reverted";
      title = "Tu insignia de Proveedor Autorizado fue actualizada";
      message =
        "Tras una nueva revisión, el estado de tu verificación cambió. Revisá tu panel para ver el detalle.";
      html = emailShell(
        firstName,
        "Tu verificación fue actualizada",
        "#b45309",
        `Tras una nueva revisión, el estado de tu verificación de <strong>Proveedor Autorizado</strong> cambió. Entrá a tu panel para ver el detalle y los próximos pasos.`,
        "Ver mi verificación"
      );
    }

    // 1. In-app
    await admin.from("notifications").insert({
      user_id: pro.profile_id,
      type,
      title,
      message,
      data: { link: PRO_LINK },
    });

    // 2. Email (Resend)
    await sendEmail(email, `${title} — ContrataCR`, html);
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
      data: { link: `/es/admin/proveedores/${professionalId}` },
    }));
    if (rows.length > 0) await admin.from("notifications").insert(rows);

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
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
    });
  } catch (err) {
    console.error("[verification-notify] email failed:", err);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
