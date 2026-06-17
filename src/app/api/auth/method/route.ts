import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";

// POST /api/auth/method { email } → which sign-in method(s) the account uses, so the
// login/registration UI can guide the user (e.g. "this account uses Google") instead
// of a vague "wrong password" or creating a duplicate. Rate-limited to curb
// account-enumeration; returns ONLY method info (no names/ids/other data).
export async function POST(req: NextRequest) {
  const rl = enforceRateLimit(req, "auth-method", 12, 60_000);
  if (rl) return rl;

  let email = "";
  try {
    ({ email } = await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Falta el correo" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin.rpc("auth_providers_for_email", { p_email: email });
    const providers = data ? String(data).split(",").map((p) => p.trim()).filter(Boolean) : [];
    const hasPassword = providers.includes("email");
    // Social providers (no app password): google / facebook / etc.
    const social = providers.filter((p) => p !== "email");
    return NextResponse.json({
      exists: providers.length > 0,
      hasPassword,
      social, // e.g. ["google"]
    });
  } catch {
    // Best-effort: on any failure fall back to "unknown" so the caller uses its
    // generic message (never block auth on this helper).
    return NextResponse.json({ exists: false, hasPassword: false, social: [] });
  }
}
