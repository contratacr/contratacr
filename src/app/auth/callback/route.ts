import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLocalRequest, isProductionSupabaseTarget } from "@/lib/security/write-guard";
import { isUnsafeProductionSupabaseRuntime } from "@/lib/security/supabase-target";
import { resolveAuthCallbackLocale } from "@/lib/auth/callback-locale";

function withPostLoginActivity(path: string): string {
  const normalized = path.replace(/^\/(?:es|en)(?=\/|$)/, "") || "/";
  if (!normalized.startsWith("/dashboard")) return path;

  const [pathAndQuery, hash = ""] = path.split("#");
  const [pathname, query = ""] = pathAndQuery.split("?");
  const params = new URLSearchParams(query);
  params.set("postLogin", "1");
  const qs = params.toString();
  return `${pathname}${qs ? `?${qs}` : ""}${hash ? `#${hash}` : ""}`;
}

async function reactivateAccount(userId: string): Promise<"ok" | "deletion-pending"> {
  try {
    const admin = createAdminClient();
    const { data: deletion } = await admin
      .from("account_deletion_requests")
      .select("id")
      .eq("user_id", userId)
      .in("status", ["pending", "processing", "failed"])
      .maybeSingle();
    if (deletion) return "deletion-pending";

    const { error } = await admin
      .from("profiles")
      .update({ is_disabled: false, disabled_reason: null, disabled_at: null })
      .eq("id", userId)
      .eq("is_disabled", true);

    if (error) {
      console.error("[account-reactivation] OAuth callback update failed", {
        userId,
        code: error.code,
      });
    }
  } catch (error) {
    console.error("[account-reactivation] OAuth callback failed", { userId, error });
  }
  return "ok";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  const callbackLocale = resolveAuthCallbackLocale(searchParams.get("locale"), safeNext);

  if (code || tokenHash) {
    if (isUnsafeProductionSupabaseRuntime() || (isLocalRequest(request) && isProductionSupabaseTarget())) {
      return NextResponse.redirect(`${origin}/${callbackLocale}?auth=unsafe_prod_env_blocked`);
    }

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
    const hadSessionBeforeVerification = !!(await supabase.auth.getUser()).data.user;
    const { data, error } = tokenHash
      ? await supabase.auth.verifyOtp({ type: (type ?? "email") as EmailOtpType, token_hash: tokenHash })
      : await supabase.auth.exchangeCodeForSession(code!);

    // ── Email change confirmation — handle FIRST and TOLERANTLY ─────────────────
    // The change is applied by `verifyOtp`, but email security scanners can prefetch
    // the single-use token before the human click. Be tolerant, but never show success
    // unless Auth really reports the expected new email; otherwise the old email would
    // still be reserved while the UI claims it changed.
    if (tokenHash && type === "email_change") {
      const u = data.user ?? (await supabase.auth.getUser()).data.user;
      if (u) {
        const lc = u.user_metadata?.email_change_locale === "en" ? "en" : "es";
        const expectedEmail =
          typeof u.user_metadata?.email_change_pending_to === "string"
            ? u.user_metadata.email_change_pending_to.trim().toLowerCase()
            : "";
        const authEmail = (u.email ?? "").trim().toLowerCase();
        const emailChanged = !!authEmail && (!expectedEmail ? !error : authEmail === expectedEmail);

        if (!emailChanged) {
          return NextResponse.redirect(`${origin}/${lc}/dashboard/profesional?tab=cuenta&emailChangePending=1`);
        }

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
        if (!hadSessionBeforeVerification) {
          await supabase.auth.signOut();
          return NextResponse.redirect(`${origin}/${lc}/login?emailChanged=1`);
        }

        // One unified panel for everyone — land on "Cuenta y seguridad" with the
        // success flag intact (a single hop keeps the emailChanged banner).
        return NextResponse.redirect(`${origin}/${lc}/dashboard/profesional?tab=cuenta&emailChanged=1`);
      }
      // No session in THIS browser (token consumed AND logged out here) → the change is
      // already applied, so route to login to sign in with the new email (not main).
      return NextResponse.redirect(`${origin}/${callbackLocale}/login`);
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
          return NextResponse.redirect(`${origin}/${callbackLocale}/login?autherror=use_password`);
        }
      }

      if (await reactivateAccount(data.user.id) === "deletion-pending") {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/${callbackLocale}/login?autherror=account_deletion_pending`);
      }

      // Guest→account linking: attach prior GUEST tickets with this (now
      // verified) email to the account so the history continues in-app.
      if (data.user.email && data.user.email_confirmed_at) {
        try {
          const admin = createAdminClient();
          await admin.from("support_tickets").update({ user_id: data.user.id }).is("user_id", null).ilike("email", data.user.email);
        } catch { /* best-effort */ }
      }

      const professionalSignupIncomplete =
        data.user.user_metadata?.professional_signup_started === true &&
        data.user.user_metadata?.is_provider !== true;

      // Explicit next PATH (e.g. password reset → /es/reset-password, or a support
      // email's ticket deep-link /es/dashboard/…?tab=soporte&ticket=…). `next` was
      // URL-encoded by the login page, so `searchParams.get` returns it decoded and
      // whole. Only INTERNAL paths (single leading "/", never "//") to avoid an
      // open-redirect. The "projects" alias is NOT a path — it falls through to the
      // role-aware resolution below.
      if (safeNext) {
        if (professionalSignupIncomplete && /^\/(?:es|en)\/dashboard\/profesional(?:[/?]|$)/.test(safeNext)) {
          return NextResponse.redirect(`${origin}/${callbackLocale}/registro/profesional`);
        }
        return NextResponse.redirect(`${origin}${withPostLoginActivity(safeNext)}`);
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
        return NextResponse.redirect(`${origin}/${callbackLocale}/onboarding`);
      }

      if (professionalSignupIncomplete) {
        return NextResponse.redirect(`${origin}/${callbackLocale}/registro/profesional`);
      }

      // The "Publicar proyecto" CTA carries ?next=projects → land on "Solicitudes
      // publicadas" after authenticating. Everyone lands on the ONE unified panel; it
      // opens in the right mode itself.
      // "sent_projects" is a use-mode tab, so it works for any account.
      const wantProjects = next === "projects";
      const destPath = wantProjects
        ? `/${callbackLocale}/dashboard/profesional?tab=sent_projects`
        : `/${callbackLocale}/dashboard/profesional`;

      // Cédula is NOT required up-front for clients — it is requested later, at
      // the moment they book/request a service (see the booking flow). So we no
      // longer force clients to a profile-completion screen here. Professionals
      // provide their cédula during professional registration.
      return NextResponse.redirect(`${origin}${withPostLoginActivity(destPath)}`);
    }
  }

  // Password recovery links from Supabase can arrive with the session in the URL
  // fragment (#access_token=...), which a server route cannot read. Older emails used
  // this callback as a bridge with ?next=/es/reset-password; send those requests to
  // the client page so Supabase JS can finish reading the fragment in the browser.
  if (safeNext && /^\/(es|en)\/reset-password$/.test(safeNext)) {
    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  return NextResponse.redirect(`${origin}/${callbackLocale}?auth=error`);
}
