export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

const FROM_ADDRESS = "ContrataCR <soporte@contratacr.com>";
const SUPPORT_TO   = "soportecontratacr@hotmail.com";

/* ─── Parse FormData from request ─── */
async function parseRequest(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  let name = "", email = "", subject = "", message = "";
  const fileAttachments: { filename: string; content: Buffer; contentType: string }[] = [];

  if (contentType.includes("multipart/form-data")) {
    const fd = await req.formData();
    name    = (fd.get("name")    as string) ?? "";
    email   = (fd.get("email")   as string) ?? "";
    subject = (fd.get("subject") as string) ?? "";
    message = (fd.get("message") as string) ?? "";
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
    ({ name = "", email = "", subject = "", message = "" } = body);
  }

  return { name, email, subject, message, fileAttachments };
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
        <p style="font-size:12px;color:#9ca3af;margin:0;">Respondé directamente a este correo para contestar al usuario.</p>
      </div>
    </div>`;
}

/* ─── Send via Resend ─── */
async function sendViaResend(
  name: string, email: string, subject: string, message: string,
  fileAttachments: { filename: string; content: Buffer; contentType: string }[]
) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;

  const body: Record<string, unknown> = {
    from: FROM_ADDRESS,
    to:   [SUPPORT_TO],
    reply_to: email,
    subject: `[Soporte] ${subject}`,
    html: buildHtml(name, email, subject, message, fileAttachments.map((f) => f.filename)),
  };

  if (fileAttachments.length > 0) {
    body.attachments = fileAttachments.map((f) => ({
      filename: f.filename,
      content: f.content.toString("base64"),
    }));
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[contact] Resend error:", err);
    return false;
  }
  return true;
}

/* ─── Send via SMTP (Nodemailer fallback) ─── */
async function sendViaSMTP(
  name: string, email: string, subject: string, message: string,
  fileAttachments: { filename: string; content: Buffer; contentType: string }[]
) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return false;

  const domain = user.split("@")[1]?.toLowerCase() ?? "";
  let host = process.env.SMTP_HOST ?? "smtp-mail.outlook.com";
  let port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  if (domain === "gmail.com") { host = "smtp.gmail.com"; port = 587; }

  const transporter = nodemailer.createTransport({
    host, port, secure: false,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  await transporter.sendMail({
    from: FROM_ADDRESS,
    to: SUPPORT_TO,
    replyTo: email,
    subject: `[Soporte] ${subject}`,
    html: buildHtml(name, email, subject, message, fileAttachments.map((f) => f.filename)),
    attachments: fileAttachments,
  });
  return true;
}

/* ─── Route handler ─── */
export async function POST(req: NextRequest) {
  try {
    const { name, email, subject, message, fileAttachments } = await parseRequest(req);

    if (!email || !subject || !message) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    // Try Resend first (configured in .env.local and Vercel), then SMTP fallback
    const sent = await sendViaResend(name, email, subject, message, fileAttachments)
      || await sendViaSMTP(name, email, subject, message, fileAttachments);

    if (!sent) {
      return NextResponse.json({
        ok: false,
        error: "El sistema de correo no está configurado. Escribinos directamente a soportecontratacr@hotmail.com",
      }, { status: 503 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contact] error:", err);
    return NextResponse.json({
      ok: false,
      error: "Error al enviar el mensaje. Escribinos a soportecontratacr@hotmail.com",
    }, { status: 500 });
  }
}
