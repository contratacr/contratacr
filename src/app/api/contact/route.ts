// Force Node.js runtime — required for nodemailer (not compatible with Edge)
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

/*
  Required Vercel environment variables:
    SMTP_USER  — your full email address  (e.g. soportecontratacr@hotmail.com)
    SMTP_PASS  — your email password or app password

  For Hotmail / Outlook accounts:
    1. Sign in to account.microsoft.com → Security → Advanced security options
    2. Make sure "Two-step verification" is ON
    3. Under "App passwords", create a new app password → use that as SMTP_PASS
    (If you don't have 2FA, just use your normal password)

  For Gmail accounts:
    1. Enable 2-Step Verification in your Google Account
    2. Go to Security → App passwords → generate one → use as SMTP_PASS
    Set SMTP_HOST=smtp.gmail.com and SMTP_PORT=587
*/

const SUPPORT_TO = "soportecontratacr@hotmail.com";

function createTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) return null;

  // Auto-detect host from email domain
  const domain = user.split("@")[1]?.toLowerCase() ?? "";
  let host = process.env.SMTP_HOST ?? "smtp-mail.outlook.com";
  let port = parseInt(process.env.SMTP_PORT ?? "587", 10);

  if (domain === "gmail.com") {
    host = "smtp.gmail.com";
    port = 587;
  } else if (domain === "yahoo.com" || domain === "yahoo.es") {
    host = "smtp.mail.yahoo.com";
    port = 587;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: false, // STARTTLS
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
}

export async function POST(req: NextRequest) {
  try {
    // Support both JSON (no attachments) and FormData (with attachments)
    const contentType = req.headers.get("content-type") ?? "";
    let name = "", email = "", subject = "", message = "";
    const fileAttachments: { filename: string; content: Buffer; contentType: string }[] = [];

    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      name    = (fd.get("name")    as string) ?? "";
      email   = (fd.get("email")   as string) ?? "";
      subject = (fd.get("subject") as string) ?? "";
      message = (fd.get("message") as string) ?? "";

      const files = fd.getAll("attachments") as File[];
      for (const file of files) {
        if (file && file.size > 0) {
          const buf = Buffer.from(await file.arrayBuffer());
          fileAttachments.push({
            filename: file.name,
            content: buf,
            contentType: file.type || "application/octet-stream",
          });
        }
      }
    } else {
      const body = await req.json();
      ({ name = "", email = "", subject = "", message = "" } = body);
    }

    if (!email || !subject || !message) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    // ── Send email ────────────────────────────────────────────────────────────
    const transporter = createTransporter();

    if (!transporter) {
      // SMTP not configured — still return ok so the user sees a success message,
      // but log so the developer knows to add env vars
      console.error(
        "[contact] SMTP not configured. Set SMTP_USER and SMTP_PASS in Vercel environment variables."
      );
      return NextResponse.json({
        ok: false,
        error: "El sistema de correo no está configurado aún. Por favor escribinos directamente a soportecontratacr@hotmail.com",
      }, { status: 503 });
    }

    const attachmentCount = fileAttachments.length;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 8px;">
        <div style="background: #1a2744; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0; margin-bottom: 0;">
          <h2 style="margin: 0; font-size: 18px;">Nuevo mensaje de soporte — ContrataCR</h2>
        </div>
        <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; width: 90px;">De:</td>
                <td style="padding: 8px 0; font-weight: 600; color: #111827;">${name || "Sin nombre"} &lt;${email}&gt;</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Asunto:</td>
                <td style="padding: 8px 0; color: #111827;">${subject}</td></tr>
            ${attachmentCount > 0 ? `<tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Archivos:</td>
                <td style="padding: 8px 0; color: #009FD9;">${fileAttachments.map((f) => f.filename).join(", ")}</td></tr>` : ""}
          </table>
          <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 16px 0;" />
          <div style="font-size: 14px; color: #374151; line-height: 1.7; white-space: pre-wrap;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
          <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0 16px;" />
          <p style="font-size: 12px; color: #9ca3af; margin: 0;">Respondé directamente a este correo para contestar al usuario.</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"ContrataCR Soporte" <${process.env.SMTP_USER}>`,
      to: SUPPORT_TO,
      replyTo: email,
      subject: `[Soporte] ${subject}`,
      html: htmlBody,
      attachments: fileAttachments,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contact] send error:", err);
    return NextResponse.json({
      ok: false,
      error: "Error al enviar el mensaje. Por favor escribinos a soportecontratacr@hotmail.com",
    }, { status: 500 });
  }
}
