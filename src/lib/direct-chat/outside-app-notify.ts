import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_LOGO_DARK_MODE_STYLES, emailLogoMarkup, sendBrevoEmail } from "@/lib/email/send";
import { sendWhatsAppText } from "@/lib/notifications";

// Direct messages are shared by web and native. Push reaches people who installed
// it, so anyone without a FRESH device token gets the notice by email — and
// professionals also by WhatsApp, the channel they already use with ContrataCR.
// Nothing here carries the message body to WhatsApp: it is a pointer back into
// the shared conversation, including its moderation, history and blocking.

type AdminDb = ReturnType<typeof createAdminClient>;

/** Cuántos días sin abrir la app hacen que dejemos de confiar en el push. */
const DIAS_DE_APP_VIVA = 30;

/**
 * Quién tiene la app DE VERDAD, no quién la tuvo alguna vez.
 *
 * `is_active` solo se apaga cuando un envío a Firebase falla. Quien borró la
 * app sigue marcado activo hasta que algún push rebote —y como el push es lo
 * que se manda EN VEZ del correo, ese rebote no llega nunca: la persona quedaba
 * sin push y sin correo, en silencio total.
 *
 * `last_seen_at` se refresca cada vez que la app arranca con permiso de avisos
 * (el registro del token es un upsert). Un token que no se ha visto en un mes
 * es una app borrada o abandonada: a esa persona se le avisa por fuera.
 */
export async function usersWithFreshPush(db: AdminDb, userIds: string[], dias = DIAS_DE_APP_VIVA): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Set();
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const { data, error } = await db
    .from("user_push_tokens")
    .select("user_id")
    .in("user_id", ids)
    .eq("is_active", true)
    .gte("last_seen_at", desde);
  if (error) {
    // Unknown reachability must not turn into silence for the recipient: treat
    // everyone as reachable only by email when the lookup itself fails.
    console.error("[direct-chat] push token lookup failed:", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((row) => row.user_id as string));
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function emailHtml({ origin, senderName, preview, threadUrl }: { origin: string; senderName: string; preview: string; threadUrl: string }) {
  return `
  <head><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${EMAIL_LOGO_DARK_MODE_STYLES}</style></head>
  <body style="margin:0;padding:0;background-color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ccr-email-background" style="background-color:#ffffff;"><tr><td align="center" style="padding:16px 0;">
    <table class="ccr-email-card" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;">
      <tr><td align="left" style="padding:28px 28px 12px 28px;">${emailLogoMarkup(origin)}</td></tr>
      <tr><td style="padding:6px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;">
        <h1 style="font-size:19px;font-weight:bold;margin:14px 0 10px 0;color:#162543;">${escapeHtml(senderName)} te escribió en ContrataCR</h1>
        <div class="ccr-email-body" style="font-size:14px;line-height:1.6;color:#374151;">
          <p style="margin:0 0 12px;">Tienes un mensaje nuevo en ContrataCR.</p>
          <blockquote style="margin:0 0 12px;padding:12px 16px;border-left:3px solid #009FD9;background:#f8fcff;color:#173052;border-radius:8px;">${escapeHtml(preview)}</blockquote>
          <p style="margin:0;">Puedes leerlo y responder desde la web o la app ContrataCR.</p>
        </div>
      </td></tr>
      <tr><td align="center" style="padding:22px 28px 4px 28px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#008ce0" style="border-radius:10px;"><a href="${threadUrl}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">Abrir la conversación</a></td></tr></table></td></tr>
      <tr><td align="center" style="padding:22px 28px 30px 28px;font-family:Arial,Helvetica,sans-serif;">
        <p class="ccr-email-muted" style="font-size:12px;line-height:1.6;color:#9ca3af;margin:0;">ContrataCR · Servicios en Costa Rica</p>
      </td></tr>
    </table>
  </td></tr></table></body>`;
}

export async function notifyRecipientOutsideApp({
  db,
  origin,
  conversationId,
  messageId,
  recipientId,
  recipientIsProfessional,
  senderName,
  preview,
}: {
  db: AdminDb;
  origin: string;
  conversationId: string;
  messageId: string;
  recipientId: string;
  recipientIsProfessional: boolean;
  senderName: string;
  preview: string;
}) {
  const threadUrl = `${origin.replace(/\/$/, "")}/mensajes?conversation=${encodeURIComponent(conversationId)}`;

  const [{ data: authUser }, professional] = await Promise.all([
    db.auth.admin.getUserById(recipientId),
    recipientIsProfessional
      ? db.from("professionals").select("whatsapp").eq("profile_id", recipientId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const email = authUser?.user?.email ?? null;
  const tasks: Promise<unknown>[] = [];
  if (email) {
    // Aviso, no puerta de entrada: cede antes que los correos de cuenta.
    tasks.push(sendBrevoEmail({
      nivel: "normal", purpose: "activity", eventKey: `chat:${conversationId}:${messageId}:${recipientId}`,
      to: email,
      subject: `${senderName} te escribió en ContrataCR`,
      html: emailHtml({ origin, senderName, preview, threadUrl }),
    }));
  }
  const whatsapp = (professional?.data as { whatsapp?: string | null } | null)?.whatsapp ?? undefined;
  if (whatsapp) {
    tasks.push(sendWhatsAppText(
      whatsapp,
      `Hola, ${senderName} te escribió en ContrataCR. Lee el mensaje y responde aquí: ${threadUrl}`,
    ));
  }
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") console.error("[direct-chat] outside-app notice failed:", result.reason);
  }
}
