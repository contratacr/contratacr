// Single send path for ALL of the app's automated email — Brevo transactional API.
// Every email (verification status, support inbox + replies, notifications, reports,
// new-ticket) routes through here, so the provider/from-address live in ONE place.
//
// Auth: the BREVO_API_KEY env var (set in Vercel), via Brevo's `api-key` header —
// never hardcoded. The contratacr.com domain is verified in Brevo.
//
// NOTE: the SIGNUP/OTP verification codes are sent by SUPABASE AUTH (its own SMTP
// config in the Supabase dashboard), NOT by this helper — to move those to Brevo,
// point Supabase Auth's custom SMTP at Brevo (see the report/context.md).

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

// Default From on the verified domain. Brevo wants name + email separately (not the
// "Name <email>" form), so we keep them split here.
const DEFAULT_SENDER = { name: "ContrataCR", email: "soporte@contratacr.com" };

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
