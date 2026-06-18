import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next");

  if (code || tokenHash) {
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

    // Finalize the session. OAuth + password reset arrive with a PKCE `code`
    // (exchangeCodeForSession). Email-link OTP flows — notably EMAIL CHANGE
    // (change-email.html links to /auth/callback?token_hash=…&type=email_change) —
    // MUST be finalized with verifyOtp, or the change is NEVER applied and the user
    // lands on the error page (= the main page). The token_hash flow needs NO PKCE
    // code_verifier (so it works from any browser/device) and NO redirect_to allowlist.
    const { data, error } = tokenHash
      ? await supabase.auth.verifyOtp({ type: (type ?? "email") as EmailOtpType, token_hash: tokenHash })
      : await supabase.auth.exchangeCodeForSession(code!);

    if (!error && data.user) {
      // Email change confirmed → land on the role-aware "Cuenta y seguridad" tab with
      // the success-banner flag (?emailChanged=1). The user is an existing account, so
      // role is set (RPC fallback for older metadata, mirroring the OAuth path below).
      if (tokenHash && type === "email_change") {
        let role = data.user.user_metadata?.role as string | undefined;
        if (role !== "professional" && role !== "client") {
          const { data: prof } = await supabase.rpc("get_my_profile");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = prof as any;
          if (p?.role === "professional" || p?.role === "client") role = p.role;
        }
        const panel = role === "professional" ? "profesional" : "cliente";
        return NextResponse.redirect(`${origin}/es/dashboard/${panel}?tab=cuenta&emailChanged=1`);
      }

      // ── One email = ONE login method (BLOCK mixing) ─────────────────────────
      // A Google/Facebook sign-in (flow=oauth, set by /login's OAuth buttons) must
      // NOT attach to / take over an account that already has an email+password
      // identity. Supabase GoTrue auto-links the OAuth identity to a same-email
      // account during the code exchange; left unchecked, that flips a manual
      // account to "Google", routes the user to onboarding, and can break password
      // login. So: if the just-authenticated user ALSO has an "email" (password)
      // identity, we REFUSE the OAuth session and send them to manual login with a
      // clear message — their password account stays intact. A brand-new Google
      // user (no password identity) passes through normally to onboarding.
      if (searchParams.get("flow") === "oauth") {
        const hasPassword = (data.user.identities ?? []).some((i) => i.provider === "email");
        if (hasPassword) {
          await supabase.auth.signOut();
          return NextResponse.redirect(`${origin}/es/login?autherror=use_password`);
        }
      }

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
