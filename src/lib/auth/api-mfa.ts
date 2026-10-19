import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Service-role API handlers must also respect live account MFA enrollment. */
export async function enforceApiMfa(request: NextRequest): Promise<NextResponse | null> {
  if (["/api/auth/session-mfa", "/api/auth/admin-mfa"].includes(request.nextUrl.pathname)) return null;
  if (!request.cookies.getAll().some(cookie => /^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name))) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const supabase = createServerClient(url, key, { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } });
  try {
    const { data: claims, error: claimsError } = await supabase.auth.getClaims();
    if (!claimsError && claims?.claims.sub && claims.claims.aal === "aal2") return null;
    // One indexed database check covers factors and the live role, including
    // old AAL1 tokens issued before MFA was enabled. Do not trust a cached flag.
    const { data: allowed, error } = await supabase.rpc("session_mfa_satisfied");
    if (error && error.message !== "MFA_REQUIRED") throw error;
    if (allowed === false || error?.message === "MFA_REQUIRED") return NextResponse.json({ error: "Complete la verificación en dos pasos.", code: "MFA_REQUIRED" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    if (allowed !== true) throw new Error("MFA status unavailable");
    return null;
  } catch {
    return NextResponse.json({ error: "No se pudo comprobar la seguridad de la sesión." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
