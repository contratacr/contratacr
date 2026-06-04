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
        .select("role, onboarding_completed")
        .eq("id", data.user.id)
        .single();

      if (!profile || !profile.onboarding_completed) {
        // Scenario B — new OAuth user, no role chosen yet → onboarding
        return NextResponse.redirect(`${origin}/es/onboarding`);
      }

      // Scenario A — returning user, role known
      const destPath =
        profile.role === "professional"
          ? "/es/dashboard/profesional"
          : "/es"; // clients go home
      return NextResponse.redirect(`${origin}${destPath}`);
    }
  }

  return NextResponse.redirect(`${origin}/es?auth=error`);
}
