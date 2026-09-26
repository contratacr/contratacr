import { hayCupoPara, registrarEnvio, type NivelDeCorreo } from "@/lib/email/cuota";
import { enlaceDeBaja } from "@/lib/email/baja";
// Single send path for ALL of the app's CODE-SENT email — Brevo transactional API.
// Every email the app sends from its own code (verification status, support inbox +
// replies, notifications, reports, new-ticket) routes through here, so the
// provider/from-address live in ONE place.
//
// Auth: the BREVO_API_KEY env var (set in Vercel), via Brevo's `api-key` header —
// never hardcoded. The contratacr.com domain is verified in Brevo.
//
// EMAIL IS SPLIT BY SOURCE — do not conflate the two:
//  • SUPABASE AUTH emails (signup/OTP verification, email-change, password recovery)
//    are sent by Supabase via its OWN Custom SMTP (currently Resend) configured in the
//    Supabase dashboard — NOT by this helper. Never route those through here.
//  • The app's own code-sent emails (below) → Brevo, via this helper.

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";

// Default From on the verified domain. Brevo wants name + email separately (not the
// "Name <email>" form), so we keep them split here.
const DEFAULT_SENDER = { name: "ContrataCR", email: "soporte@contratacr.com" };

export const EMAIL_LOGO_DARK_MODE_STYLES = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  .ccr-dark-logo { display:none !important; mso-hide:all; max-height:0; overflow:hidden; }
  @media (prefers-color-scheme: dark) {
    .ccr-light-logo { display:none !important; }
    .ccr-dark-logo { display:block !important; max-height:none !important; overflow:visible !important; }
  }
  [data-ogsc] .ccr-light-logo { display:none !important; }
  [data-ogsc] .ccr-dark-logo { display:block !important; max-height:none !important; overflow:visible !important; }
`;

export function emailLogoMarkup(origin = "https://contratacr.com") {
  const site = origin.replace(/\/$/, "");
  return `
    <img class="ccr-light-logo" src="${site}/brand/email-logo-light.png" width="167" height="36" alt="ContrataCR" style="display:block;border:0;outline:none;text-decoration:none;width:167px;height:auto;margin:0 auto;">
    <img class="ccr-dark-logo" src="${site}/brand/email-logo-dark.png" width="167" height="36" alt="ContrataCR" style="display:none;border:0;outline:none;text-decoration:none;width:167px;height:auto;margin:0 auto;max-height:0;overflow:hidden;mso-hide:all;">
  `;
}

/**
 * One branded shell for EVERY ContrataCR email: light/dark logo centered on a
 * white card — the exact structure of the password-reset email — so no sender
 * hand-rolls its own header again. `bodyHtml` renders inside the card.
 */
export function brandedEmailDocument({ title, bodyHtml, origin = "https://contratacr.com" }: { title: string; bodyHtml: string; origin?: string }) {
  return `<!doctype html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <title>${title}</title>
      <style>${EMAIL_LOGO_DARK_MODE_STYLES}</style>
    </head>
    <body style="margin:0;padding:0;background:#f4f7fa;color:#162543;font-family:Arial,Helvetica,sans-serif">
      <div style="padding:28px 14px">
        <div style="max-width:532px;margin:0 auto;padding:30px 34px;background:#fff;border:1px solid #e6edf3;border-radius:18px">
          <div style="margin:0 auto 24px">${emailLogoMarkup(origin)}</div>
          ${bodyHtml}
        </div>
      </div>
    </body>
    </html>`;
}

export type DeliveryStatus = "sent" | "failed" | "skipped";
export type EmailResult = { ok: boolean; status: DeliveryStatus; detail: string | null };

// Brevo attachment: base64 `content` + a `name`.
export type EmailAttachment = { name: string; content: string };

export async function sendBrevoEmail(opts: {
  to: string | undefined | null;
  subject: string;
  html: string;
  /**
   * Qué tan imprescindible es este correo. Decide si sale cuando el día se
   * está acabando: los 300 diarios del plan gratuito los comparten los correos
   * que el app NECESITA mandar con los avisos y con las campañas.
   *
   * Por defecto `critico`: quien no lo declara es porque manda algo de entrar a
   * la cuenta o de soporte, y ante la duda es mejor que salga.
   */
  nivel?: NivelDeCorreo;
  /** Reply-To — e.g. the user's email on a support-inbox notification, so a human
   *  reply from the inbox goes to them. */
  replyTo?: string | { email: string; name?: string };
  /** Override the From (still must be on the verified @contratacr.com domain). */
  sender?: { name?: string; email: string };
  attachments?: EmailAttachment[];
  /**
   * Etiqueta de campaña. Viaja a Brevo como `tags` y vuelve en el aviso del
   * webhook: es lo único que permite saber a qué envío pertenece una apertura
   * o un clic. Sin ella el aviso llega con el correo de la persona pero sin
   * decir de cuál campaña, y no se puede anotar en ninguna fila.
   */
  campana?: string;
}): Promise<EmailResult> {
  const key = process.env.BREVO_API_KEY;
  if (!key) return { ok: false, status: "skipped", detail: "Brevo not configured (BREVO_API_KEY missing)" };
  if (!opts.to) return { ok: false, status: "skipped", detail: "No recipient email" };

  const nivel = opts.nivel ?? "critico";
  if (!(await hayCupoPara(nivel))) {
    return { ok: false, status: "skipped", detail: `Sin cupo diario para correo de nivel ${nivel}` };
  }

  const replyTo =
    typeof opts.replyTo === "string" ? { email: opts.replyTo } : opts.replyTo;

  const body: Record<string, unknown> = {
    sender: opts.sender ? { name: opts.sender.name ?? "ContrataCR", email: opts.sender.email } : DEFAULT_SENDER,
    to: [{ email: opts.to }],
    subject: opts.subject,
    htmlContent: opts.html,
    ...(replyTo ? { replyTo } : {}),
    ...(opts.attachments && opts.attachments.length > 0 ? { attachment: opts.attachments } : {}),
    ...(opts.campana ? { tags: [opts.campana] } : {}),
    // LA CABECERA QUE DECIDE SI EL CORREO CAE EN NO DESEADO.
    //
    // Gmail y Yahoo la exigen desde 2024 a quien manda en volumen: es lo que
    // pinta el botón «Cancelar suscripción» arriba del mensaje. El pie decía
    // «responde con la palabra BAJA», que le sirve a una persona pero que el
    // buzón no puede leer; para Gmail esto era correo masivo sin salida.
    //
    // `List-Unsubscribe-Post` es la parte que de verdad cuenta (RFC 8058):
    // autoriza al buzón a dar de baja él mismo, con un POST y sin abrir nada.
    //
    // Solo en los correos de novedades. Los de cuenta y seguridad no la
    // llevan: no son publicidad, y ofrecer darse de baja de «recuperar tu
    // contraseña» dejaría a alguien sin poder entrar.
    ...(nivel === "masivo"
      ? {
          headers: {
            "List-Unsubscribe": `<${enlaceDeBaja(APP_URL, opts.to)}>, <mailto:soporte@contratacr.com?subject=BAJA>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }
      : {}),
  };

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[brevo] send failed:", res.status, txt);
      return { ok: false, status: "failed", detail: `HTTP ${res.status} ${txt}` };
    }
    await registrarEnvio(nivel);
    return { ok: true, status: "sent", detail: null };
  } catch (err) {
    console.error("[brevo] send error:", err);
    return { ok: false, status: "failed", detail: String(err) };
  }
}
