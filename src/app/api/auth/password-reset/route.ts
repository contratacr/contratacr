import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEnlaceDeContrasena, requestOrigin } from "@/lib/auth/enlace-de-contrasena";
import { enforceRateLimit } from "@/lib/rate-limit";

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

    const resultado = await enviarEnlaceDeContrasena({ email, origin, resetPath });
    if (resultado === "sin_enlace") return NextResponse.json({ error: "reset_failed" }, { status: 400 });
    if (resultado === "sin_envio") return NextResponse.json({ error: "reset_failed" }, { status: 502 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "reset_failed" }, { status: 400 });
  }
}
