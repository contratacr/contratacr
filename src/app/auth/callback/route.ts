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
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;

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

    // ── Email change confirmation — handle FIRST and TOLERANTLY ─────────────────
    // The change is applied by `verifyOtp`, but email security scanners (Outlook /
    // corporate) often PREFETCH the link and CONSUME the single-use token_hash before
    // the human clicks — so by the real click verifyOtp ERRORS even though the email
    // already changed. Previously that fell through to the error page (= the MAIN
    // page). Instead, resolve the user from the verify result OR the existing session
    // and land on the role-aware "Cuenta y seguridad" tab with the success-banner flag
    // (?emailChanged=1) — never the main page.
    if (tokenHash && type === "email_change") {
      const u = data.user ?? (await supabase.auth.getUser()).data.user;
      if (u) {
        // Keep public.profiles.email IN SYNC with the new auth email. The unique index
        // on profiles.email (migration 007) would otherwise keep the OLD email reserved
        // and wrongly block a future signup from reusing the freed email. This mirrors
        // migration 065's auth.users trigger — belt-and-suspenders, harmless if both run.
        if (u.email) {
          try {
            const admin = createAdminClient();
            await admin.from("profiles").update({ email: u.email }).eq("id", u.id);
          } catch { /* best-effort — never block the redirect over the email mirror */ }
        }
        // Preserve the UI locale the user changed their email from (stashed in
        // user_metadata by account-security — the static email template can't know it).
        const lc = u.user_metadata?.email_change_locale === "en" ? "en" : "es";
        // One unified panel for everyone — land on "Cuenta y seguridad" with the
        // success flag intact (a single hop keeps the emailChanged banner).
        return NextResponse.redirect(`${origin}/${lc}/dashboard/profesional?tab=cuenta&emailChanged=1`);
      }
      // No session in THIS browser (token consumed AND logged out here) → the change is
      // already applied, so route to login to sign in with the new email (not main).
      return NextResponse.redirect(`${origin}/es/login`);
    }

    if (!error && data.user) {
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
      if (safeNext) {
        return NextResponse.redirect(`${origin}${safeNext}`);
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
      if (!onboardingDone) {
        const { data: prof } = await supabase.rpc("get_my_profile");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = prof as any;
        if (p?.onboarding_completed) onboardingDone = true;
      }

      if (!onboardingDone) {
        // Genuinely new OAuth user, no role chosen yet → onboarding.
        return NextResponse.redirect(`${origin}/es/onboarding`);
      }

      // The "Publicar proyecto" CTA carries ?next=projects → land on "Mis solicitudes
      // publicadas" after authenticating. Everyone lands on the ONE unified panel; it
      // opens in the right mode itself.
      // "sent_projects" is a use-mode tab, so it works for any account.
      const wantProjects = next === "projects";
      const destPath = wantProjects
        ? "/es/dashboard/profesional?tab=sent_projects"
        : "/es/dashboard/profesional";

      // Cédula is NOT required up-front for clients — it is requested later, at
      // the moment they book/request a service (see the booking flow). So we no
      // longer force clients to a profile-completion screen here. Professionals
      // provide their cédula during professional registration.
      return NextResponse.redirect(`${origin}${destPath}`);
    }
  }

  // Password recovery links from Supabase can arrive with the session in the URL
  // fragment (#access_token=...), which a server route cannot read. Older emails used
  // this callback as a bridge with ?next=/es/reset-password; send those requests to
  // the client page so Supabase JS can finish reading the fragment in the browser.
  if (safeNext && /^\/(es|en)\/reset-password$/.test(safeNext)) {
    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  return NextResponse.redirect(`${origin}/es?auth=error`);
}
