import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_LOGO_DARK_MODE_STYLES, emailLogoMarkup, sendBrevoEmail } from "@/lib/email/send";
import { sendWhatsAppText } from "@/lib/notifications";

// Direct messages live inside the app. Push only reaches people who installed
// it, so anyone without an active device token gets the notice by email — and
// professionals also by WhatsApp, the channel they already use with ContrataCR.
// Nothing here carries the message body to WhatsApp: it is a pointer back into
// the conversation, which keeps moderation, history and blocking in the app.

type AdminDb = ReturnType<typeof createAdminClient>;

export async function usersWithActivePush(db: AdminDb, userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Set();
  const { data, error } = await db
    .from("user_push_tokens")
    .select("user_id")
    .in("user_id", ids)
    .eq("is_active", true);
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
  <body style="margin:0;padding:0;background-color:#f4f7fa;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f7fa;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background-color:#ffffff;border-radius:16px;border:1px solid #eef1f5;">
      <tr><td align="center" style="padding:30px 32px 6px 32px;">${emailLogoMarkup(origin)}</td></tr>
      <tr><td style="padding:6px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;">
        <h1 style="font-size:19px;font-weight:bold;margin:14px 0 10px 0;color:#162543;">${escapeHtml(senderName)} te escribió en ContrataCR</h1>
        <div style="font-size:14px;line-height:1.6;color:#374151;">
          <p style="margin:0 0 12px;">Tienes un mensaje nuevo esperando en la app.</p>
          <blockquote style="margin:0 0 12px;padding:12px 16px;border-left:3px solid #009FD9;background:#f8fcff;color:#173052;border-radius:8px;">${escapeHtml(preview)}</blockquote>
          <p style="margin:0;">Responde desde la app ContrataCR. Si aún no la tienes instalada, el enlace abre la conversación en tu navegador.</p>
        </div>
      </td></tr>
      <tr><td align="center" style="padding:22px 32px 4px 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#008ce0" style="border-radius:10px;"><a href="${threadUrl}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">Abrir la conversación</a></td></tr></table></td></tr>
      <tr><td align="center" style="padding:22px 32px 30px 32px;font-family:Arial,Helvetica,sans-serif;">
        <p style="font-size:12px;line-height:1.6;color:#9ca3af;margin:0;border-top:1px solid #eef1f5;padding-top:16px;"><strong style="color:#162543;">ContrataCR</strong> — Ofrece y encuentra servicios en Costa Rica</p>
      </td></tr>
    </table>
  </td></tr></table></body>`;
}

export async function notifyRecipientOutsideApp({
  db,
  origin,
  conversationId,
  recipientId,
  recipientIsProfessional,
  senderName,
  preview,
}: {
  db: AdminDb;
  origin: string;
  conversationId: string;
  recipientId: string;
  recipientIsProfessional: boolean;
  senderName: string;
  preview: string;
}) {
  const threadUrl = `${origin.replace(/\/$/, "")}/es/mensajes?conversation=${encodeURIComponent(conversationId)}`;

  const [{ data: authUser }, professional] = await Promise.all([
    db.auth.admin.getUserById(recipientId),
    recipientIsProfessional
      ? db.from("professionals").select("whatsapp").eq("profile_id", recipientId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const email = authUser?.user?.email ?? null;
  const tasks: Promise<unknown>[] = [];
  if (email) {
    tasks.push(sendBrevoEmail({
      to: email,
      subject: `${senderName} te escribió en ContrataCR`,
      html: emailHtml({ origin, senderName, preview, threadUrl }),
    }));
  }
  const whatsapp = (professional?.data as { whatsapp?: string | null } | null)?.whatsapp ?? undefined;
  if (whatsapp) {
    tasks.push(sendWhatsAppText(
      whatsapp,
      `Hola, ${senderName} te escribió en ContrataCR. Responde desde la app: ${threadUrl}`,
    ));
  }
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") console.error("[direct-chat] outside-app notice failed:", result.reason);
  }
}
