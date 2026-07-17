"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { detectSocialOnly, providerLabel } from "@/lib/auth-method";
import { OtpVerification } from "@/components/auth/otp-verification";

type FormData = { email: string; password: string };

// After a CLIENT-side sign-in the @supabase/ssr browser client writes the session
// COOKIE, but a hard navigation can race that write — the server proxy would then
// see no session and bounce the user back to /login (manual login "doesn't reach the
// panel", while OAuth does because its callback sets the cookie server-side). Wait
// (briefly) for the auth cookie to be present before navigating. Resolves instantly
// once it's set; bounded so it never hangs.
async function waitForAuthCookie(maxMs = 2000): Promise<void> {
  const has = () =>
    typeof document !== "undefined" &&
    document.cookie.split(";").some((c) => {
      const n = c.trim();
      return n.startsWith("sb-") && n.includes("-auth-token");
    });
  const start = Date.now();
  while (!has() && Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 40));
  }
}

// A post-login `?redirect=` is honored ONLY when it targets an AUTHENTICATED area —
// a `/dashboard` deep-link (the proxy preserves these for gated pages, incl.
// support-ticket / notification email links) or the "projects" alias. A generic /
// PUBLIC target (home `/`, `/buscar`, a profile — e.g. the navbar "Ingresar"
// current-path) returns null, so it can NEVER override the role-based DASHBOARD
// redirect (that was the "login lands on the main page" regression). Returns
// "projects", a (possibly locale-prefixed) /dashboard path, or null.
function meaningfulRedirect(raw: string | null): string | null {
  if (!raw) return null;
  if (raw === "projects") return "projects";
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  const path = raw.replace(/^\/(?:es|en)(?=\/|$)/, "") || "/";
  return path.startsWith("/dashboard") ? raw : null;
}

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

const POST_LOGIN_PROMPT_KEY = "contratacr:post-login-prompt";

function setPostLoginPrompt(userId = "") {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      POST_LOGIN_PROMPT_KEY,
      JSON.stringify({ ts: Date.now(), userId }),
    );
  } catch {
    /* ignore */
  }
}

export default function LoginPage() {
  const t = useTranslations("auth.login");
  const locale = useLocale();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  // When a manual login fails because the email is a Google-only account, highlight
  // the provider button and show a specific message.
  const [socialHint, setSocialHint] = useState<"google" | null>(null);

  // Built inside the component so the validation messages are localized.
  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(t("emailInvalid")),
        password: z.string().min(1, t("passwordRequired")),
      }),
    [t]
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  // A blocked OAuth attempt — a social provider on an email that already has a
  // password account — bounces back here with ?autherror=use_password (set by
  // /auth/callback). Surface the reason so the user signs in with their password.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("autherror") === "use_password") {
      // This mirrors a callback query param after mount; it should not affect SSR.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(t("blockedUsePassword"));
    }
    if (params.get("emailChanged") === "1") {
      setSuccessNotice(t("emailChangedLogin"));
    }
  }, [t]);

  async function finishPasswordLogin(supabase: ReturnType<typeof createClient>) {
    const redirect = meaningfulRedirect(new URLSearchParams(window.location.search).get("redirect"));
    await waitForAuthCookie();

    const { data: userData } = await supabase.auth.getUser();
    setPostLoginPrompt(userData.user?.id);
    const metadata = userData.user?.user_metadata ?? {};
    if (metadata.professional_signup_started === true && metadata.is_provider !== true) {
      window.location.assign(`/${locale}/registro/profesional`);
      return;
    }

    if (redirect && redirect !== "projects") {
      const dest = /^\/(es|en)(\/|$)/.test(redirect) ? redirect : `/${locale}${redirect}`;
      window.location.assign(withPostLoginActivity(dest));
      return;
    }

    const dest =
      redirect === "projects"
        ? "/dashboard/profesional?tab=sent_projects"
        : "/dashboard/profesional";
    window.location.assign(withPostLoginActivity(`/${locale}${dest}`));
  }

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    setError(null);
    setSocialHint(null);
    setOtpEmail(null);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    setSubmitting(false);
    if (authError) {
      const code = (authError as { code?: string }).code ?? "";
      const message = authError.message.toLowerCase();
      if (code === "email_not_confirmed" || message.includes("email not confirmed") || message.includes("not confirmed")) {
        setOtpEmail(data.email);
        return;
      }
      // The email may belong to an account created with a social provider (no password
      // in our app). Detect that and guide the user to that EXACT method, instead of
      // a dead-end "wrong password". Falls back to the generic message otherwise.
      const provider = await detectSocialOnly(data.email);
      if (provider) {
        if (provider === "facebook") {
          setError(t("facebookUnavailable"));
          return;
        }
        setSocialHint("google");
        setError(t("socialOnly", { provider: providerLabel(provider) }));
        return;
      }
      setError(t("loginError"));
      return;
    }
    await finishPasswordLogin(supabase);
  }

  // Carry the post-login destination through the OAuth round-trip via the callback's
  // `next` param. `?redirect=` may be a full in-app PATH (a support email's ticket
  // deep-link, preserved by the proxy) → pass it as an ENCODED `next` so the callback
  // URL stays well-formed (the unencoded query was what broke the OAuth code exchange
  // = auth=error); or the "projects" alias, which the callback role-resolves.
  function oauthCallbackUrl() {
    // Same gate as manual login: carry only a MEANINGFUL target through OAuth (a
    // /dashboard deep-link or "projects"); a generic/public redirect → no `next`, so
    // the callback role-resolves to the right panel instead of bouncing to the page
    // the user came from (e.g. home). `flow=oauth` lets /auth/callback enforce "one
    // email = one method". The `next` stays URL-ENCODED (an unencoded query
    // previously broke the code exchange = auth=error).
    const next = meaningfulRedirect(new URLSearchParams(window.location.search).get("redirect")) ?? "";
    return window.location.origin + "/auth/callback?flow=oauth" + (next ? `&next=${encodeURIComponent(next)}` : "");
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setError(null);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: oauthCallbackUrl() },
    });
    setGoogleLoading(false);
  }

  if (otpEmail) {
    return (
      <div className="min-h-screen flex flex-col bg-[#fafafa]">
        <Navbar />
        <main className="flex-1 flex items-center justify-center py-12 px-4">
          <div className="w-full max-w-sm">
            <div className="bg-white rounded-3xl shadow-sm border border-[#e5e7eb] p-8">
              <OtpVerification
                email={otpEmail}
                autoResendOnMount
                onVerified={async () => {
                  await finishPasswordLogin(createClient());
                }}
              />
            </div>
          </div>
        </main>
        <LandingFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <Navbar />
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md">
          {/* Same card container as the client ("Crear cuenta de cliente") and
              professional registrations — clean white card, hairline border, soft
              shadow, p-8 — so the whole auth flow (login + both signups) is consistent. */}
          <div className="bg-white rounded-3xl shadow-sm border border-[#e5e7eb] p-8">
          <div className="text-center mb-8">
            <ContrataCRLogo className="justify-center mb-4" />
            <h1 className="text-2xl font-bold text-[#111827]">{t("title")}</h1>
            <p className="text-[#6b7280] text-sm mt-1">{t("subtitle")}</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 mb-4">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {successNotice && (
            <div className="flex items-start gap-3 p-3.5 bg-[#f0f9ff] border border-[#bae6fd] rounded-xl text-sm text-[#075985] mb-4">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[#009FD9]" />
              <div>
                <p className="font-semibold text-[#0f172a]">{t("emailChangedTitle")}</p>
                <p>{successNotice}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <Input
              label={t("email")}
              type="email"
              placeholder="tu@email.com"
              error={errors.email?.message}
              {...register("email")}
            />
            <div>
              <Input
                label={t("password")}
                type="password"
                placeholder="••••••••"
                error={errors.password?.message}
                {...register("password")}
              />
              <div className="flex justify-end mt-1">
                <Link href="/olvide-contrasena" className="text-xs text-[#009FD9] hover:underline">
                  {t("forgotPassword")}
                </Link>
              </div>
            </div>
            <Button type="submit" size="lg" loading={submitting} className="mt-2">
              {submitting ? t("submitting") : (
                <>
                  {t("submit")} <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#e5e7eb]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-4 text-xs text-[#9ca3af]">{t("or")}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {/* Google */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading}
              className={`w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white border rounded-xl text-sm font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${socialHint === "google" ? "border-[#009FD9] ring-2 ring-[#009FD9]/30" : "border-[#e5e7eb]"}`}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              {googleLoading ? t("redirecting") : t("continueGoogle")}
            </button>
          </div>

          <p className="text-center text-sm text-[#6b7280] mt-6">
            {t("noAccount")}{" "}
            <Link href="/registro" className="text-[#009FD9] font-medium hover:underline">
              {t("signUp")}
            </Link>
          </p>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
