// Branded support-ticket email notifications (Brevo). Best-effort: failures are
// logged and never break the request. Clickable links only — no raw URLs.
import { sendBrevoEmail } from "@/lib/email/send";
import { cloudinaryAssetUrl } from "@/lib/cloudinary";

const SUPPORT_TO = "soporte@contratacr.com";
const SITE = "https://contratacr.com";
const LOGO = cloudinaryAssetUrl("contratacr/brand/email-logo.png", "f_png,w_128");
type SupportLocale = "es" | "en";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendEmail(to: string, subject: string, html: string, replyTo?: string): Promise<void> {
  await sendBrevoEmail({ to, subject, html, replyTo });
}

/** Branded shell with an optional CTA button (clickable link, never a raw URL). */
function shell(headline: string, bodyHtml: string, cta?: { href: string; label: string }): string {
  return `
  <body style="margin:0;padding:0;background-color:#f4f7fa;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f7fa;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background-color:#ffffff;border-radius:16px;border:1px solid #eef1f5;">
      <tr><td align="center" style="padding:30px 32px 6px 32px;">
        <img src="${LOGO}" width="44" height="44" alt="ContrataCR" style="display:block;border:0;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;margin-top:8px;color:#162543;">Contrata<span style="color:#008ce0;">CR</span></div>
      </td></tr>
      <tr><td style="padding:6px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;">
        <h1 style="font-size:19px;font-weight:bold;margin:14px 0 10px 0;color:#162543;">${escapeHtml(headline)}</h1>
        <div style="font-size:14px;line-height:1.6;color:#374151;">${bodyHtml}</div>
      </td></tr>
      ${cta ? `<tr><td align="center" style="padding:22px 32px 4px 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#008ce0" style="border-radius:10px;"><a href="${cta.href}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(cta.label)}</a></td></tr></table></td></tr>` : ""}
      <tr><td align="center" style="padding:22px 32px 30px 32px;font-family:Arial,Helvetica,sans-serif;">
        <p style="font-size:12px;line-height:1.6;color:#9ca3af;margin:0;border-top:1px solid #eef1f5;padding-top:16px;"><strong style="color:#162543;">ContrataCR</strong> — Ofrece y encuentra servicios en Costa Rica</p>
      </td></tr>
    </table>
  </td></tr></table></body>`;
}

/** New ticket OR a user reply landed → tell the support inbox to check. */
export async function notifySupportInbox(opts: {
  subject: string;
  fromName?: string | null;
  fromEmail: string;
  body: string;
  isReply?: boolean;
}): Promise<void> {
  const headline = opts.isReply ? "Respuesta de un usuario en un ticket" : "Nuevo ticket de soporte";
  const html = shell(
    headline,
    `<p style="margin:0 0 12px 0;"><strong>De:</strong> ${escapeHtml(opts.fromName || "Sin nombre")} &lt;${escapeHtml(opts.fromEmail)}&gt;<br/><strong>Asunto:</strong> ${escapeHtml(opts.subject)}</p>
     <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;white-space:pre-wrap;">${escapeHtml(opts.body)}</div>`,
    { href: `${SITE}/es/admin/soporte`, label: "Abrir en el panel" },
  );
  await sendEmail(SUPPORT_TO, `[Soporte] ${opts.isReply ? "Re: " : ""}${opts.subject}`, html, opts.fromEmail);
}

export function supportTicketCreatedAutoMessage(locale: SupportLocale = "es"): string {
  return locale === "en"
    ? "Thank you, we received your support ticket. Our team will review it and reply as soon as possible."
    : "Gracias, recibimos su tiquete de soporte. Nuestro equipo lo revisará y le responderá lo antes posible.";
}

export async function notifyUserTicketCreated(opts: {
  toEmail: string;
  locale?: SupportLocale;
  ticketRef?: string;
}): Promise<void> {
  const locale = opts.locale === "en" ? "en" : "es";
  const message = supportTicketCreatedAutoMessage(locale);
  const headline = locale === "en" ? "Support ticket received" : "Tiquete de soporte recibido";
  const subject = locale === "en"
    ? "We received your support ticket | ContrataCR"
    : "Recibimos su tiquete de soporte | ContrataCR";
  const refHtml = opts.ticketRef
    ? `<p style="margin:12px 0 0 0;color:#6b7280;font-size:13px;"><strong>${locale === "en" ? "Ticket" : "Tiquete"}:</strong> ${escapeHtml(opts.ticketRef)}</p>`
    : "";

  const html = shell(
    headline,
    `<p style="margin:0;">${escapeHtml(message)}</p>${refHtml}`,
  );
  await sendEmail(opts.toEmail, subject, html);
}

/** Admin replied → email the user so they receive it (with a link to continue).
 *  The follow-up path DIFFERS by whether the recipient has an account:
 *   • ACCOUNT holder → continue in their panel ("Ver conversación").
 *   • GUEST (no account) → has NO panel, so "responder desde tu panel" is
 *     contradictory. Instead invite them to sign in / create an account with THIS
 *     email — `claimGuestTickets()` then attaches this ticket to the account so it
 *     appears in their panel and they can keep replying. We do NOT suggest replying
 *     to this email: inbound email is not wired into the ticket thread. */
export async function notifyUserOfReply(opts: {
  toEmail: string;
  toName?: string | null;
  subject: string;
  body: string;
  hasAccount?: boolean;
  /** Which dashboard the account holder's ticket lives in. */
  panel?: "cliente" | "profesional";
  /** Ticket id → the email deep-links to this exact open conversation. */
  ticketId?: string;
}): Promise<void> {
  const firstName = (opts.toName ?? "").split(" ")[0] || "";
  const panel = opts.panel === "profesional" ? "profesional" : "cliente";
  // Account holders → deep-link straight to THIS ticket open in their panel. The
  // target is carried through login + Google OAuth (login → ?redirect=… → callback
  // ?next=…), so even a logged-out click lands on the open conversation.
  const ticketPath = `/es/dashboard/${panel}?tab=soporte${opts.ticketId ? `&ticket=${opts.ticketId}` : ""}`;
  const followHtml = opts.hasAccount
    ? `<p style="margin:14px 0 0 0;color:#6b7280;font-size:13px;">Puedes responder desde tu panel para continuar la conversación.</p>`
    : `<p style="margin:14px 0 0 0;color:#6b7280;font-size:13px;">Para ver la conversación completa y seguir respondiendo, crea una cuenta o inicia sesión con este correo (${escapeHtml(opts.toEmail)}). Encontrarás este tiquete en tu panel.</p>`;
  const cta = opts.hasAccount
    ? { href: `${SITE}${ticketPath}`, label: "Ver conversación" }
    : { href: `${SITE}/es/login`, label: "Crear cuenta o iniciar sesión" };
  const html = shell(
    "Tienes una respuesta de soporte",
    `<p style="margin:0 0 12px 0;">${firstName ? `Hola ${escapeHtml(firstName)}, ` : ""}respondimos a tu consulta <strong>“${escapeHtml(opts.subject)}”</strong>:</p>
     <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;white-space:pre-wrap;">${escapeHtml(opts.body)}</div>
     ${followHtml}`,
    cta,
  );
  await sendEmail(opts.toEmail, `Re: ${opts.subject} — ContrataCR`, html);
}
