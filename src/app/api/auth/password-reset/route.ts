import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_LOGO_DARK_MODE_STYLES, emailLogoMarkup, sendBrevoEmail } from "@/lib/email/send";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestHost } from "@/lib/security/write-guard";

function requestOrigin(req: NextRequest) {
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return `${proto}://${requestHost(req)}`;
}

function isValidEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
  const rl = enforceRateLimit(req, "password-reset", 8, 60_000);
  if (rl) return rl;

  let email = "";
  let redirectTo = "";
  try {
    const body = await req.json();
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    redirectTo = typeof body.redirectTo === "string" ? body.redirectTo : "";
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const requestedLocale = (() => {
    try {
      const url = new URL(redirectTo);
      return url.pathname.startsWith("/en/") || url.pathname === "/en" ? "en" : "es";
    } catch {
      return "es";
    }
  })();
  const origin = requestOrigin(req);
  const resetPath = `/${requestedLocale}/reset-password`;

  const admin = createAdminClient();

  try {
    const { data: rows } = await admin.from("profiles").select("id").ilike("email", email);
    let foundMatchingAuthUser = false;

    for (const row of (rows ?? []) as { id: string }[]) {
      const { data } = await admin.auth.admin.getUserById(row.id);
      const user = data?.user;
      if (!user?.email || user.email.toLowerCase() !== email) continue;

      foundMatchingAuthUser = true;
      if (!user.email_confirmed_at) {
        return NextResponse.json({ error: "email_not_confirmed" }, { status: 403 });
      }
      break;
    }

    // Keep the response generic when no confirmed account is found, so this endpoint
    // does not become a reliable account-enumeration oracle.
    if (!foundMatchingAuthUser) return NextResponse.json({ ok: true });

    // Generate a token-hash link instead of a PKCE recovery link. PKCE stores its
    // verifier in the browser that requested the email, so opening the message on
    // another phone/computer can fail. verifyOtp(token_hash) is device-independent.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      return NextResponse.json({ error: "reset_failed" }, { status: 400 });
    }

    const recoveryUrl = new URL("/auth/callback", origin);
    recoveryUrl.searchParams.set("token_hash", tokenHash);
    recoveryUrl.searchParams.set("type", "recovery");
    recoveryUrl.searchParams.set("next", resetPath);

    const sent = await sendBrevoEmail({
      to: email,
      subject: "Restablece tu contraseña - ContrataCR",
      html: `
        <!doctype html>
        <html lang="es">
        <head>
          <meta charset="utf-8">
          <meta name="color-scheme" content="light dark">
          <meta name="supported-color-schemes" content="light dark">
          <style>${EMAIL_LOGO_DARK_MODE_STYLES}</style>
        </head>
        <body style="margin:0;padding:0;background:#f4f7fa;color:#162543;font-family:Arial,Helvetica,sans-serif">
          <div style="padding:28px 14px">
          <div style="max-width:532px;margin:0 auto;padding:30px 34px;background:#fff;border:1px solid #e6edf3;border-radius:18px">
            <div style="margin:0 auto 24px">${emailLogoMarkup(origin)}</div>
            <h1 style="font-size:21px;line-height:1.25;margin:0 0 10px">Restablece tu contrase&ntilde;a</h1>
            <p style="font-size:15px;line-height:1.65;color:#374151;margin:0 0 24px">Recibimos una solicitud para restablecer la contrase&ntilde;a de tu cuenta. Usa este bot&oacute;n para crear una nueva.</p>
            <div style="text-align:center">
              <a href="${recoveryUrl.toString()}" style="display:inline-block;padding:14px 28px;background:#009fd9;border-radius:12px;color:#fff;font-size:15px;font-weight:700;text-decoration:none">Crear nueva contrase&ntilde;a</a>
            </div>
            <p style="font-size:12px;line-height:1.6;color:#8b97a6;margin:20px 0 0">Si no solicitaste este cambio, ignora el correo y tu contrase&ntilde;a seguir&aacute; igual.</p>
          </div>
          </div>
        </body>
        </html>`,
    });
    if (!sent.ok) {
      return NextResponse.json({ error: "reset_failed" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "reset_failed" }, { status: 400 });
  }
}
