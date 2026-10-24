import { nombreDeSaludo } from "@/lib/nombres";
// Branded support-ticket email notifications (Brevo). Best-effort: failures are
// logged and never break the request. Clickable links only — no raw URLs.
import { EMAIL_LOGO_DARK_MODE_STYLES, emailLogoMarkup, sendBrevoEmail } from "@/lib/email/send";
import { guestAccessLink } from "@/lib/support/guest-access";
const SITE = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";
type SupportLocale = "es" | "en";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendEmail(to: string, subject: string, html: string, replyTo?: string, eventKey?: string): Promise<void> {
  await sendBrevoEmail({ to, subject, html, replyTo, purpose: "support", eventKey });
}

/** Branded shell with an optional CTA button (clickable link, never a raw URL). */
function shell(headline: string, bodyHtml: string, cta?: { href: string; label: string }): string {
  return `
  <head><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${EMAIL_LOGO_DARK_MODE_STYLES}</style></head>
  <body style="margin:0;padding:0;background-color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ccr-email-background" style="background-color:#ffffff;"><tr><td align="center" style="padding:16px 0;">
    <table class="ccr-email-card" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;">
      <tr><td align="left" style="padding:28px 28px 12px 28px;">
        ${emailLogoMarkup(SITE)}
      </td></tr>
      <tr><td style="padding:6px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;">
        <h1 style="font-size:19px;font-weight:bold;margin:14px 0 10px 0;color:#162543;">${escapeHtml(headline)}</h1>
        <div class="ccr-email-body" style="font-size:14px;line-height:1.6;color:#374151;">${bodyHtml}</div>
      </td></tr>
      ${cta ? `<tr><td align="center" style="padding:22px 28px 4px 28px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#008ce0" style="border-radius:10px;"><a href="${cta.href}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(cta.label)}</a></td></tr></table></td></tr>` : ""}
      <tr><td align="center" style="padding:22px 28px 30px 28px;font-family:Arial,Helvetica,sans-serif;">
        <p class="ccr-email-muted" style="font-size:12px;line-height:1.6;color:#9ca3af;margin:0;">ContrataCR · Servicios en Costa Rica</p>
      </td></tr>
    </table>
  </td></tr></table></body>`;
}

export function supportTicketCreatedAutoMessage(locale: SupportLocale = "es"): string {
  return locale === "en"
    ? "Thank you, we received your support ticket. Our team will review it and reply as soon as possible."
    : "Gracias, recibimos su caso de soporte. Nuestro equipo lo revisará y le responderá lo antes posible.";
}

export async function notifyUserTicketCreated(opts: {
  toEmail: string;
  locale?: SupportLocale;
  ticketRef?: string;
}): Promise<void> {
  const locale = opts.locale === "en" ? "en" : "es";
  const message = supportTicketCreatedAutoMessage(locale);
  const headline = locale === "en" ? "Support ticket received" : "Caso de soporte recibido";
  const subject = locale === "en"
    ? "We received your support ticket | ContrataCR"
    : "Recibimos su caso de soporte | ContrataCR";
  const refHtml = opts.ticketRef
    ? `<p style="margin:12px 0 0 0;color:#6b7280;font-size:13px;"><strong>${locale === "en" ? "Ticket" : "Caso"}:</strong> ${escapeHtml(opts.ticketRef)}</p>`
    : "";

  const html = shell(
    headline,
    `<p style="margin:0;">${escapeHtml(message)}</p>${refHtml}`,
  );
  await sendEmail(opts.toEmail, subject, html, undefined, opts.ticketRef ? `support-created:${opts.ticketRef}` : undefined);
}

/** Guests with account-access cases may continue via a scoped private link.
 * Other guests sign in with the same email and land on this exact ticket. */
export function supportReplyEmail(opts: {
  toEmail: string;
  toName?: string | null;
  subject: string;
  body: string;
  hasAccount?: boolean;
  /** Which dashboard the account holder's ticket lives in. */
  panel?: "cliente" | "profesional";
  /** Ticket id → the email deep-links to this exact open conversation. */
  ticketId?: string;
  topic?: string | null;
  eventKey?: string;
}): string {
  const firstName = nombreDeSaludo(opts.toName);
  const panel = opts.panel === "profesional" ? "profesional" : "cliente";
  // Account holders → deep-link straight to THIS ticket open in their panel. The
  // target is carried through login + Google OAuth (login → ?redirect=… → callback
  // ?next=…), so even a logged-out click lands on the open conversation.
  const ticketPath = `/dashboard/${panel}?tab=soporte${opts.ticketId ? `&ticket=${opts.ticketId}` : ""}`;
  const privateLink = !opts.hasAccount && opts.topic === "subject1" && opts.ticketId
    ? guestAccessLink(SITE, opts.ticketId, opts.toEmail) : null;
  const followHtml = privateLink
    ? `<p style="margin:14px 0 0;color:#6b7280;font-size:13px;">Puedes continuar este caso de acceso sin crear una cuenta mediante el enlace privado. Es válido por 14 días; no lo compartas. Responde desde el caso: las respuestas a este correo no se agregan a la conversación.</p>`
    : opts.hasAccount
    ? `<p style="margin:14px 0 0 0;color:#6b7280;font-size:13px;">Puedes responder desde tu panel para continuar la conversación.</p>`
    : `<p style="margin:14px 0 0 0;color:#6b7280;font-size:13px;">Para ver la conversación completa y seguir respondiendo, crea una cuenta o inicia sesión con este correo (${escapeHtml(opts.toEmail)}). Encontrarás este caso en tu panel.</p>`;
  const cta = privateLink
    ? { href: privateLink, label: "Continuar mi caso" }
    : opts.hasAccount
    ? { href: `${SITE}${ticketPath}`, label: "Ver conversación" }
    : { href: `${SITE}/login?redirect=${encodeURIComponent(ticketPath)}`, label: "Crear cuenta o iniciar sesión" };
  const html = shell(
    "Tienes una respuesta de soporte",
    `<p style="margin:0 0 12px 0;">${firstName ? `Hola ${escapeHtml(firstName)}, ` : ""}respondimos a tu consulta <strong>"${escapeHtml(opts.subject)}"</strong>:</p>
     <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;white-space:pre-wrap;">${escapeHtml(opts.body)}</div>
     ${followHtml}`,
    cta,
  );
  return html;
}

export async function notifyUserOfReply(opts: Parameters<typeof supportReplyEmail>[0]): Promise<void> {
  await sendEmail(opts.toEmail, `Re: ${opts.subject} — ContrataCR`, supportReplyEmail(opts), undefined, opts.eventKey);
}
