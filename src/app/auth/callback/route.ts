import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Password reset flow → explicit next param (e.g. /es/reset-password)
      if (next) {
        return NextResponse.redirect(`${origin}${next}`);
      }

      // ── Scenario A & B: check profiles table for role + onboarding status ──
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, onboarding_completed, cedula")
        .eq("id", data.user.id)
        .single();

      if (!profile || !profile.onboarding_completed) {
        // Scenario B — new OAuth user, no role chosen yet → onboarding
        return NextResponse.redirect(`${origin}/es/onboarding`);
      }

      const destPath =
        profile.role === "professional"
          ? "/es/dashboard/profesional"
          : "/es/dashboard/cliente";

      // OAuth users never provide a cédula at sign-up. Clients must complete it
      // before they can book — send them to the mandatory completion screen.
      const provider = data.user.app_metadata?.provider;
      const isOAuth = !!provider && provider !== "email";
      const missingCedula = !profile.cedula || String(profile.cedula).trim() === "";
      if (isOAuth && profile.role !== "professional" && missingCedula) {
        return NextResponse.redirect(
          `${origin}/es/completar-perfil?next=${encodeURIComponent(destPath)}`
        );
      }

      // Scenario A — returning user with completed onboarding → go to their dashboard
      return NextResponse.redirect(`${origin}${destPath}`);
    }
  }

  return NextResponse.redirect(`${origin}/es?auth=error`);
}
