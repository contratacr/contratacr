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
  /** Reply-To — e.g. the user's email on a support-inbox notification, so a human
   *  reply from the inbox goes to them. */
  replyTo?: string | { email: string; name?: string };
  /** Override the From (still must be on the verified @contratacr.com domain). */
  sender?: { name?: string; email: string };
  attachments?: EmailAttachment[];
}): Promise<EmailResult> {
  const key = process.env.BREVO_API_KEY;
  if (!key) return { ok: false, status: "skipped", detail: "Brevo not configured (BREVO_API_KEY missing)" };
  if (!opts.to) return { ok: false, status: "skipped", detail: "No recipient email" };

  const replyTo =
    typeof opts.replyTo === "string" ? { email: opts.replyTo } : opts.replyTo;

  const body: Record<string, unknown> = {
    sender: opts.sender ? { name: opts.sender.name ?? "ContrataCR", email: opts.sender.email } : DEFAULT_SENDER,
    to: [{ email: opts.to }],
    subject: opts.subject,
    htmlContent: opts.html,
    ...(replyTo ? { replyTo } : {}),
    ...(opts.attachments && opts.attachments.length > 0 ? { attachment: opts.attachments } : {}),
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
    return { ok: true, status: "sent", detail: null };
  } catch (err) {
    console.error("[brevo] send error:", err);
    return { ok: false, status: "failed", detail: String(err) };
  }
}
