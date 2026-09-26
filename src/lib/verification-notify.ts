import { createAdminClient } from "@/lib/supabase/admin";
import { brandedEmailDocument, sendBrevoEmail } from "@/lib/email/send";
import { sendNotificationPush } from "@/lib/push/notify";

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

// ── First contact when a professional lands in manual review ─────────────────
// Sent once per account (the in-app notification doubles as the marker):
// in-app + email always, WhatsApp only when an approved Meta template name is
// Asks only for what the account does not hold yet — never for the name,
// cédula or phone already on file. WhatsApp is deliberately NOT sent from here:
// business-initiated messages would need a Meta template, and replies to the
// API number land in an inbox nobody reads. The owner writes those by hand from
// the admin queue, where the message comes pre-written and the contact is logged.
/**
 * CUÁNTAS VECES SE LE INSISTE A ALGUIEN, Y CADA CUÁNTO.
 *
 * Como mucho DOS avisos en toda la vida de la cuenta: el primero cuando el
 * perfil queda en revisión, y un único recordatorio 30 días después. No hay un
 * tercero a propósito: quien ignoró dos mensajes no manda las fotos al quinto,
 * y seguir escribiéndole a alguien que no contesta es lo que hace que el
 * dominio entero termine en No deseado —el problema que acabamos de arreglar
 * en las campañas—. Una insignia no es una urgencia.
 */
export const MAX_AVISOS_DE_VERIFICACION = 2;
export const DIAS_ENTRE_AVISOS = 30;

/** Qué aviso toca ahora para esta persona, o `null` si ya no toca ninguno. */
export async function avisoQueTocaDeVerificacion(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string | null,
): Promise<"primero" | "recordatorio" | null> {
  if (!profileId) return null;
  const { data, error } = await admin
    .from("notifications")
    .select("created_at")
    .eq("user_id", profileId)
    .eq("type", "verification_outreach")
    .order("created_at", { ascending: false })
    .limit(MAX_AVISOS_DE_VERIFICACION);
  // Si la consulta falla no se avisa: repetirle a quien ya recibió el mensaje
  // es peor que dejarlo para el próximo intento.
  if (error) return null;
  const avisos = data ?? [];
  if (avisos.length === 0) return "primero";
  if (avisos.length >= MAX_AVISOS_DE_VERIFICACION) return null;
  const ultimo = new Date(avisos[0].created_at as string).getTime();
  if (Number.isNaN(ultimo)) return null;
  return Date.now() - ultimo >= DIAS_ENTRE_AVISOS * 86_400_000 ? "recordatorio" : null;
}

export async function notifyVerificationOutreach(professionalId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: pro } = await admin
      .from("professionals")
      .select("profile_id, whatsapp, category_id, profiles(full_name, email, cedula)")
      .eq("id", professionalId)
      .maybeSingle();
    if (!pro?.profile_id) return;
    const toca = await avisoQueTocaDeVerificacion(admin, pro.profile_id as string);
    if (!toca) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = pro.profiles as any;
    const firstName = (profile?.full_name ?? "profesional").split(" ")[0];
    const hasId = !!profile?.cedula;
    const steps = [
      `una foto tuya sosteniendo tu identificación${hasId ? "" : " (cédula, DIMEX o pasaporte)"} junto a tu rostro`,
      "una foto o documento que respalde tu oficio (título, carné, patente o certificado)",
      "una foto de un trabajo reciente",
    ];
    // El mismo titulo que pinta la campana, para que el push y la campana no
    // digan cosas distintas del mismo aviso.
    const title = toca === "recordatorio" ? "Te falta poco para tu insignia" : "Terminemos tu verificación";
    // CORTO A PROPÓSITO. El mensaje anterior medía 373 caracteres y el push se
    // recorta a 112: a la gente le llegaba «…necesitamos: 1) una foto tuya
    // sos…» y ahí terminaba. Ni el número, ni los tres pasos, ni qué hacer.
    //
    // Ahora lo esencial va primero y el número ENTRA en el recorte, porque el
    // número es la acción. El detalle de las tres fotos vive en el correo, que
    // sí tiene espacio, y el aviso lleva al panel.
    const message = `Hola ${firstName}, faltan 3 fotos para activar tu insignia de verificado. Envíalas al WhatsApp 8962 4340.`;
    // `link`, no `href`: `notificationHref` solo mira `link`, asi que este
    // aviso no llevaba a la pantalla de verificacion sino a la lista de avisos.
    const notification = { user_id: pro.profile_id, type: "verification_outreach", title, message, data: { link: PRO_LINK } };
    await admin.from("notifications").insert(notification);
    await sendNotificationPush({ userId: pro.profile_id, title, message, data: notification.data });

    if (profile?.email) {
      const html = emailShell(
        firstName,
        toca === "recordatorio" ? "Todavía podés activar tu insignia" : "Verificación de tu perfil",
        "#009FD9",
        `${toca === "recordatorio" ? "Te escribimos hace un mes y tu insignia sigue pendiente. " : ""}Tu perfil quedó en revisión manual. Para activar la insignia de verificado necesitamos:<br/><br/>` +
          `1) ${escapeHtml(steps[0])}<br/>2) ${escapeHtml(steps[1])}<br/>3) ${escapeHtml(steps[2])}<br/><br/>` +
          `Responde a este correo con las fotos o envíalas por WhatsApp al <a href="https://wa.me/50689624340" style="color:#009FD9;font-weight:700;text-decoration:none">+506&nbsp;8962&nbsp;4340</a> y te activamos la insignia en cuanto las revisemos.`,
        null
      );
      await sendBrevoEmail({
        to: profile.email,
        subject: toca === "recordatorio"
          ? "Tu insignia de verificado sigue pendiente"
          : "Para activar tu insignia de verificado en ContrataCR",
        html,
        replyTo: "soporte@contratacr.com",
      });
    }
  } catch (error) {
    console.warn("[verification] outreach not sent", error instanceof Error ? error.message : error);
  }
}

// Admin button "Avisar por app y correo": every professional still waiting gets the
// first-contact notice in the app and by email, at most once each. Free, and the
// answer lands in the support mailbox the owner actually reads.
export async function outreachPendingProfessionals(): Promise<{ pending: number; notified: number; alreadyNotified: number; reminded: number }> {
  const admin = createAdminClient();
  const { data: pending } = await admin.from("professionals").select("id, profile_id").in("verification_status", ["pending", "under_appeal"]);
  let notified = 0, alreadyNotified = 0, reminded = 0;
  for (const pro of pending ?? []) {
    // La misma regla que aplica el envío, para que el panel no prometa un
    // número distinto del que sale.
    const toca = await avisoQueTocaDeVerificacion(admin, (pro.profile_id as string | null) ?? null);
    if (!toca) { alreadyNotified += 1; continue; }
    await notifyVerificationOutreach(pro.id);
    if (toca === "recordatorio") reminded += 1; else notified += 1;
  }
  return { pending: (pending ?? []).length, notified, alreadyNotified, reminded };
}
