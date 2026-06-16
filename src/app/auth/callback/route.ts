import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

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
      // Guest→account linking: attach prior GUEST tickets with this (now
      // verified) email to the account so the history continues in-app.
      if (data.user.email && data.user.email_confirmed_at) {
        try {
          const admin = createAdminClient();
          await admin.from("support_tickets").update({ user_id: data.user.id }).is("user_id", null).ilike("email", data.user.email);
        } catch { /* best-effort */ }
      }

      // Explicit next PATH (e.g. password reset → /es/reset-password). The
      // "projects" alias is NOT a path — it's resolved to the role-aware projects
      // section AFTER we know the role (below), so let it fall through.
      if (next && next.startsWith("/")) {
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

      // The "Publicar proyecto" CTA carries ?next=projects → land on the role-aware
      // "Mis proyectos publicados" section after authenticating.
      const wantProjects = next === "projects";
      const destPath =
        profile.role === "professional"
          ? wantProjects ? "/es/dashboard/profesional?tab=sent_projects" : "/es/dashboard/profesional"
          : wantProjects ? "/es/dashboard/cliente?tab=projects" : "/es/dashboard/cliente";

      // Cédula is NOT required up-front for clients — it is requested later, at
      // the moment they book/request a service (see the booking flow). So we no
      // longer force clients to a profile-completion screen here. Professionals
      // provide their cédula during professional registration.
      return NextResponse.redirect(`${origin}${destPath}`);
    }
  }

  return NextResponse.redirect(`${origin}/es?auth=error`);
}
