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

      // Explicit next PATH (e.g. password reset → /es/reset-password, or a support
      // email's ticket deep-link /es/dashboard/…?tab=soporte&ticket=…). `next` was
      // URL-encoded by the login page, so `searchParams.get` returns it decoded and
      // whole. Only INTERNAL paths (single leading "/", never "//") to avoid an
      // open-redirect. The "projects" alias is NOT a path — it falls through to the
      // role-aware resolution below.
      if (next && next.startsWith("/") && !next.startsWith("//")) {
        return NextResponse.redirect(`${origin}${next}`);
      }

      // ── Onboarding decision ──
      // CANONICAL signal = `user_metadata.onboarding_completed` (same as the proxy +
      // the onboarding page). DO NOT select `profiles.onboarding_completed`/`cedula`
      // here: migration 047 COLUMN-restricts them from the authenticated role, so the
      // select ERRORS → null → EVERY existing OAuth user was wrongly sent to
      // /onboarding (then bounced to the panel = the onboarding "flash"). For accounts
      // whose metadata predates the flag, fall back to the SECURITY DEFINER RPC
      // (`get_my_profile`) which returns the full row regardless of column grants.
      let onboardingDone = data.user.user_metadata?.onboarding_completed === true;
      let role = data.user.user_metadata?.role as string | undefined;
      if (!onboardingDone || (role !== "professional" && role !== "client")) {
        const { data: prof } = await supabase.rpc("get_my_profile");
        if (prof) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = prof as any;
          if (p.onboarding_completed) onboardingDone = true;
          if (p.role === "professional" || p.role === "client") role = p.role;
        }
      }

      if (!onboardingDone) {
        // Genuinely new OAuth user, no role chosen yet → onboarding.
        return NextResponse.redirect(`${origin}/es/onboarding`);
      }

      // The "Publicar proyecto" CTA carries ?next=projects → land on the role-aware
      // "Mis proyectos publicados" section after authenticating.
      const wantProjects = next === "projects";
      const destPath =
        role === "professional"
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
