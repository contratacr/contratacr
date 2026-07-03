export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { validateUpload, IMAGE_KINDS, DOC_KINDS } from "@/lib/upload-validation";
import { sendBrevoEmail } from "@/lib/email/send";
import { notifyUserTicketCreated, supportTicketCreatedAutoMessage } from "@/lib/support-notify";
import { supportTicketRef } from "@/lib/support-ticket";
import { LONG_TEXT_MAX_LENGTH, NAME_MAX_LENGTH, SHORT_TEXT_MAX_LENGTH, limitTrimmedText } from "@/lib/text-limits";

// ALL of the app's automated email goes through BREVO (the contratacr.com domain is
// verified there → SPF/DKIM pass → good deliverability), via the shared
// `sendBrevoEmail` helper. Zoho stays only as a HUMAN mailbox for
// soporte@contratacr.com (a person can read/reply there manually) — the app never
// sends through it. From-address is the verified @contratacr.com domain.
const SUPPORT_TO = "soporte@contratacr.com";
type SupportLocale = "es" | "en";

function normalizeLocale(value?: string | null): SupportLocale {
  return value === "en" ? "en" : "es";
}

function localeFromRequest(req: NextRequest, submittedLocale?: string | null): SupportLocale {
  if (submittedLocale === "en" || submittedLocale === "es") return submittedLocale;
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const path = new URL(referer).pathname;
      if (path === "/en" || path.startsWith("/en/")) return "en";
      if (path === "/es" || path.startsWith("/es/")) return "es";
    } catch { /* ignore malformed referers */ }
  }
  return normalizeLocale(req.headers.get("accept-language")?.toLowerCase().startsWith("en") ? "en" : "es");
}

/* ─── Parse FormData from request ─── */
async function parseRequest(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  let name = "", email = "", subject = "", message = "", topic = "", locale = "";
  const fileAttachments: { filename: string; content: Buffer; contentType: string }[] = [];

  if (contentType.includes("multipart/form-data")) {
    const fd = await req.formData();
    name    = (fd.get("name")    as string) ?? "";
    email   = (fd.get("email")   as string) ?? "";
    subject = (fd.get("subject") as string) ?? "";
    message = (fd.get("message") as string) ?? "";
    topic   = (fd.get("topic")   as string) ?? "";
    locale  = (fd.get("locale")  as string) ?? "";
    for (const file of fd.getAll("attachments") as File[]) {
      if (file && file.size > 0) {
        fileAttachments.push({
          filename: file.name,
          content: Buffer.from(await file.arrayBuffer()),
          contentType: file.type || "application/octet-stream",
        });
      }
    }
  } else {
    const body = await req.json();
    ({ name = "", email = "", subject = "", message = "", topic = "", locale = "" } = body);
  }

  return {
    name: limitTrimmedText(name, NAME_MAX_LENGTH),
    email: limitTrimmedText(email, SHORT_TEXT_MAX_LENGTH),
    subject: limitTrimmedText(subject, SHORT_TEXT_MAX_LENGTH),
    message: limitTrimmedText(message, LONG_TEXT_MAX_LENGTH),
    topic: limitTrimmedText(topic, SHORT_TEXT_MAX_LENGTH),
    locale: limitTrimmedText(locale, SHORT_TEXT_MAX_LENGTH),
    fileAttachments,
  };
}

/* ─── HTML email body ─── */
function buildHtml(name: string, email: string, subject: string, message: string, filenames: string[]) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:8px;">
      <div style="background:#1a2744;color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">Nuevo mensaje de soporte — ContrataCR</h2>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:13px;width:80px;">De:</td>
            <td style="padding:8px 0;font-weight:600;color:#111827;">${name || "Sin nombre"} &lt;${email}&gt;</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:13px;">Asunto:</td>
            <td style="padding:8px 0;color:#111827;">${subject}</td>
          </tr>
          ${filenames.length > 0 ? `
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:13px;">Archivos:</td>
            <td style="padding:8px 0;color:#009FD9;">${filenames.join(", ")}</td>
          </tr>` : ""}
        </table>
        <hr style="border:none;border-top:1px solid #f3f4f6;margin:16px 0;"/>
        <div style="font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
        <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0 16px;"/>
        <p style="font-size:12px;color:#9ca3af;margin:0;">Responde directamente a este correo para contestar al usuario.</p>
      </div>
    </div>`;
}

/* ─── Send the new-ticket notification to the support inbox via Brevo ─── */
async function sendInboxEmail(
  name: string, email: string, subject: string, message: string,
  fileAttachments: { filename: string; content: Buffer; contentType: string }[]
): Promise<boolean> {
  const r = await sendBrevoEmail({
    to: SUPPORT_TO,
    replyTo: email, // so a human reply from the inbox goes to the requester
    subject: `[Soporte] ${subject}`,
    html: buildHtml(name, email, subject, message, fileAttachments.map((f) => f.filename)),
    attachments: fileAttachments.map((f) => ({ name: f.filename, content: f.content.toString("base64") })),
  });
  return r.ok;
}

/* ─── Persist as an admin support ticket + seed the thread's first message ─── */
type SavedSupportTicket = {
  id: string;
  created_at?: string | null;
  case_number?: number | string | null;
};

async function saveTicket(name: string, email: string, subject: string, message: string, topic: string | undefined, locale: SupportLocale): Promise<SavedSupportTicket | null> {
  try {
    let userId: string | null = null;
    try {
      const supa = await createClient();
      const { data } = await supa.auth.getUser();
      userId = data.user?.id ?? null;
    } catch { /* guest — no session */ }
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: ticket, error } = await admin
      .from("support_tickets")
      .insert({ user_id: userId, name: name || null, email, subject, message, topic: topic || null, last_reply_at: now, last_reply_role: "user" })
      .select("id, created_at, case_number")
      .single();
    if (error) { console.error("[contact] ticket insert:", error.message); return null; }
    // Seed the conversation thread with the user's first message plus the one-time
    // support acknowledgement. Keep last_reply_role as "user" so admin queues still
    // treat the new ticket as needing attention.
    if (ticket?.id) {
      const { error: msgErr } = await admin.from("support_ticket_messages").insert([
        {
          ticket_id: ticket.id,
          sender_role: "user",
          sender_id: userId,
          sender_name: name || null,
          body: message,
        },
        {
          ticket_id: ticket.id,
          sender_role: "admin",
          sender_name: "Soporte ContrataCR",
          body: supportTicketCreatedAutoMessage(locale),
        },
      ]);
      if (msgErr) console.error("[contact] ticket messages insert:", msgErr.message);
    }
    return ticket;
  } catch (e) {
    console.error("[contact] ticket insert:", e);
    return null;
  }
}

/* ─── Route handler ─── */
async function resolveRequester(input: { name: string; email: string }) {
  try {
    const supa = await createClient();
    const { data } = await supa.auth.getUser();
    const user = data.user;
    if (!user) return input;

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();

    return {
      name: limitTrimmedText(profile?.full_name || (user.user_metadata?.full_name as string) || input.name, NAME_MAX_LENGTH),
      email: limitTrimmedText(profile?.email || user.email || input.email, SHORT_TEXT_MAX_LENGTH),
    };
  } catch {
    return input;
  }
}

export async function POST(req: NextRequest) {
  const rl = enforceRateLimit(req, "contact", 5, 60_000);
  if (rl) return rl;
  try {
    const parsed = await parseRequest(req);
    const { subject, message, topic, fileAttachments } = parsed;
    const locale = localeFromRequest(req, parsed.locale);
    const { name, email } = await resolveRequester({ name: parsed.name, email: parsed.email });

    if (!email || !subject || !message) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    // Validate EVERY attachment by magic bytes — safe images OR PDF only (no SVG /
    // scripts / executables), 4 MB each — before saving or emailing anything.
    for (const f of fileAttachments) {
      const check = validateUpload(f.content, {
        allow: [...IMAGE_KINDS, ...DOC_KINDS],
        maxBytes: 4 * 1024 * 1024,
        allowLabel: "JPG, PNG, WEBP o PDF",
      });
      if (!check.ok) {
        return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
      }
    }

    // Record the ticket in the admin panel (primary record), then notify the support
    // inbox by email — via Brevo. Even if the email can't be sent, the ticket is
    // already saved and shows in the admin panel.
    const ticketSaved = await saveTicket(name, email, subject, message, topic, locale);
    const sent = await sendInboxEmail(name, email, subject, message, fileAttachments);
    if (ticketSaved) {
      await notifyUserTicketCreated({
        toEmail: email,
        locale,
        ticketRef: supportTicketRef(ticketSaved.id, ticketSaved.created_at, ticketSaved.case_number),
      });
    }

    if (!ticketSaved && !sent) {
      return NextResponse.json({
        ok: false,
        error: "No pudimos registrar tu mensaje. Intenta de nuevo en unos minutos.",
      }, { status: 503 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contact] error:", err);
    return NextResponse.json({
      ok: false,
      error: "Error al enviar el mensaje. Intenta de nuevo en unos minutos.",
    }, { status: 500 });
  }
}
