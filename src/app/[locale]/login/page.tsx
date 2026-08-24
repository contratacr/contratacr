"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient, hasSupabaseBrowserConfig } from "@/lib/supabase/client";
import { LandingFooter } from "@/components/landing/landing-footer";
import { detectSocialOnly, providerLabel } from "@/lib/auth-method";
import { isNativeAppRuntime } from "@/hooks/use-native-app";
import { nativeSocialSignIn } from "@/lib/auth/native-social-login";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { OtpVerification } from "@/components/auth/otp-verification";
import { PageRouteLoading } from "@/components/ui/route-loading";
import type { User } from "@supabase/supabase-js";
import { withPromiseTimeout } from "@/lib/promise-timeout";

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

// A post-login `?redirect=` is honored only for authenticated-area deep links, the
// mobile direct-message inbox, plus the explicit guest-review continuation marker.
// Generic public redirects still return null so the navbar "Ingresar" flow keeps
// landing in the role-aware panel.
function meaningfulRedirect(raw: string | null): string | null {
  if (!raw) return null;
  if (raw === "projects") return "projects";
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  const path = raw.replace(/^\/(?:es|en)(?=\/|$)/, "") || "/";
  if (path.startsWith("/dashboard")) return raw;
  const [pathname, query = ""] = path.split(/[?#]/, 2);
  if (pathname === "/mensajes") return raw;
  const params = new URLSearchParams(query);
  if (pathname.startsWith("/profesionales/") && params.get("pendingReview") === "1") return raw;
  return null;
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

function authUnavailableMessage(locale: string) {
  return locale === "en"
    ? "Login is not available in this local preview because Supabase environment variables are missing."
    : "El inicio de sesión no está disponible en este localhost porque faltan las variables de Supabase.";
}

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

async function reactivateSignedInAccount(): Promise<"ok" | "deletion-pending"> {
  try {
    const response = await fetch("/api/account/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reactivate" }),
      signal: AbortSignal.timeout(4_000),
    });
    if (response.status === 409) return "deletion-pending";
    if (!response.ok) {
      console.warn("[account-reactivation] Could not reactivate the signed-in account");
    }
  } catch {
    // Keep login available. The account screen still provides a manual recovery
    // action if this best-effort request is interrupted.
  }
  return "ok";
}

export default function LoginPage() {
  const t = useTranslations("auth.login");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Session created, handing off to /auth/callback: cover the form so the person
  // never sees the login screen again between Google's window and their panel.
  const [leaving, setLeaving] = useState(false);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  // When a manual login fails because the email is a Google-only account, highlight
  // the provider button and show a specific message.
  const [socialHint, setSocialHint] = useState<"google" | "apple" | null>(null);
  const registerRedirect = searchParams.get("redirect");
  const registerHref = registerRedirect ? `/registro?redirect=${encodeURIComponent(registerRedirect)}` : "/registro";

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
    if (params.get("autherror") === "account_deletion_pending") {
      setError(t("accountDeletionPending"));
    }
    if (params.get("emailChanged") === "1") {
      setSuccessNotice(t("emailChangedLogin"));
    }
  }, [t]);

  async function finishPasswordLogin(supabase: ReturnType<typeof createClient>, signedInUser?: User | null) {
    const redirect = meaningfulRedirect(new URLSearchParams(window.location.search).get("redirect"));
    await waitForAuthCookie();

    let resolvedUser = signedInUser ?? null;
    if (!resolvedUser) {
      try {
        const { data } = await withPromiseTimeout(supabase.auth.getUser(), 5_000, "post-login-user-timeout");
        resolvedUser = data.user ?? null;
      } catch {
        // The successful sign-in already wrote the session. Navigation must not
        // remain blocked just because this optional confirmation timed out.
      }
    }
    if (resolvedUser) {
      const reactivation = await reactivateSignedInAccount();
      if (reactivation === "deletion-pending") {
        await supabase.auth.signOut();
        setError(t("accountDeletionPending"));
        setSubmitting(false);
        return;
      }
    }
    setPostLoginPrompt(resolvedUser?.id);
    const metadata = resolvedUser?.user_metadata ?? {};
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
    if (!hasSupabaseBrowserConfig()) {
      setSubmitting(false);
      setError(authUnavailableMessage(locale));
      return;
    }
    const supabase = createClient();
    let authResult;
    try {
      authResult = await withPromiseTimeout(supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      }), 15_000, "password-login-timeout");
    } catch {
      setSubmitting(false);
      setError(t("loginError"));
      return;
    }
    const { data: authData, error: authError } = authResult;
    if (authError) {
      setSubmitting(false);
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
        setSocialHint(provider === "apple" ? "apple" : "google");
        setError(t("socialOnly", { provider: providerLabel(provider) }));
        return;
      }
      setError(t("loginError"));
      return;
    }
    await finishPasswordLogin(supabase, authData.user);
    // Keep the button busy during the hard navigation so a second login cannot
    // start while the destination request is being resolved.
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
    return window.location.origin + `/auth/callback?flow=oauth&locale=${locale}` + (next ? `&next=${encodeURIComponent(next)}` : "");
  }

  const [appleLoading, setAppleLoading] = useState(false);

  async function handleSocial(provider: "google" | "apple") {
    if (provider === "google") setGoogleLoading(true);
    else setAppleLoading(true);
    setError(null);
    if (!hasSupabaseBrowserConfig()) {
      setError(authUnavailableMessage(locale));
      if (provider === "google") setGoogleLoading(false);
      else setAppleLoading(false);
      return;
    }
    const supabase = createClient();
    // Inside the app the platform sheet signs the user in without leaving
    // ContrataCR; the callback only has to resolve where they land.
    if (isNativeAppRuntime()) {
      // The native sheet covers the page; the moment it closes we are either
      // handing off or back here. Cover the form now so the hand-off never
      // shows the login screen again; uncover only if the person cancelled.
      setLeaving(true);
      try {
        const outcome = await nativeSocialSignIn(provider, supabase);
        if (outcome === "signed-in") {
          // Same-origin path, never the absolute callback URL: the server origin
          // can differ from the one the WebView loaded (0.0.0.0 vs localhost),
          // and an absolute URL would push the user out of the app mid-login.
          const callback = oauthCallbackUrl().replace("flow=oauth", "flow=native");
          window.location.assign(callback.slice(callback.indexOf("/auth/callback")));
          return;
        }
        setLeaving(false);
        if (outcome === "cancelled") {
          if (provider === "google") setGoogleLoading(false);
          else setAppleLoading(false);
          return;
        }
        // "unavailable": provider not configured for this platform → web flow.
      } catch (nativeError) {
        setLeaving(false);
        setError(nativeError instanceof Error ? nativeError.message : String(nativeError));
        if (provider === "google") setGoogleLoading(false);
        else setAppleLoading(false);
        return;
      }
    }
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: oauthCallbackUrl() },
    });
    if (oauthError) {
      const message = oauthError.message.toLowerCase();
      const providerUnavailable =
        message.includes("provider is not enabled") ||
        message.includes("unsupported provider") ||
        message.includes("validation_failed");
      setError(
        provider === "apple" && providerUnavailable
          ? locale === "en"
            ? "Sign in with Apple is temporarily unavailable. Please use Google or your email while we finish configuring it."
            : "Iniciar sesión con Apple no está disponible temporalmente. Usa Google o tu correo mientras terminamos de configurarlo."
          : oauthError.message
      );
    }
    if (provider === "google") setGoogleLoading(false);
    else setAppleLoading(false);
  }

  async function handleGoogle() { await handleSocial("google"); }

  // Web: Google Identity Services signed the person in on this page and handed
  // us an ID token; Supabase verifies it directly, and /auth/callback resolves
  // the destination from the session exactly as it does for the native sheet.
  // No hop through <project>.supabase.co, so Google's screen names our domain.
  // Cover the form the moment the Google button is pressed — BEFORE Google's
  // window opens. iOS restores a frozen snapshot of the page when the person
  // comes back, and that snapshot must already be the loading mark, not the
  // login form. The cover is visual only (pointer events pass through) and never
  // sticks: if Google's window does not open within 1.5s it lifts at once; if the
  // person comes back without choosing an account it lifts 2.5s after the return
  // (a credential arrives well within that); touching the page lifts it too.
  const googleCredentialSeen = useRef(false);
  // The "touch the page to lift" listener of the current press; retired on
  // return or on the next press so a stale one never lifts a fresh cover.
  const googleTapLift = useRef<(() => void) | null>(null);
  function retireGoogleTapLift() {
    if (googleTapLift.current) document.removeEventListener("pointerdown", googleTapLift.current);
    googleTapLift.current = null;
  }
  function handleGoogleOpen() {
    googleCredentialSeen.current = false;
    retireGoogleTapLift();
    setLeaving(true);
    const lift = () => {
      if (googleTapLift.current === lift) googleTapLift.current = null;
      if (!googleCredentialSeen.current) setLeaving(false);
    };
    googleTapLift.current = lift;
    window.setTimeout(() => {
      if (googleTapLift.current === lift) document.addEventListener("pointerdown", lift, { once: true });
    }, 400);
  }
  function handleGoogleLeave() {
    // Google's window is up; nothing to do — the cover is already in place.
  }
  function handleGoogleReturn(opened: boolean) {
    const lift = () => {
      retireGoogleTapLift();
      if (!googleCredentialSeen.current) setLeaving(false);
    };
    if (!opened) { lift(); return; }
    window.setTimeout(lift, 2500);
  }

  async function handleGoogleCredential(idToken: string, nonce: string) {
    googleCredentialSeen.current = true;
    retireGoogleTapLift();
    // Google's window has just closed: cover the form right now, not after the
    // token exchange — the person must never see the login screen again.
    setLeaving(true);
    setGoogleLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: tokenError } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken, nonce });
    if (tokenError) {
      setLeaving(false);
      setError(tokenError.message);
      setGoogleLoading(false);
      return;
    }
    const callback = oauthCallbackUrl().replace("flow=oauth", "flow=native");
    window.location.assign(callback.slice(callback.indexOf("/auth/callback")));
  }

  // The native app keeps its own Google sheet; the page-level button is for browsers.
  const [browserRuntime, setBrowserRuntime] = useState(false);
  useEffect(() => { setBrowserRuntime(!isNativeAppRuntime()); }, []);
  async function handleApple() { await handleSocial("apple"); }

  if (otpEmail) {
    return (
      <div className="min-h-screen flex flex-col bg-[#fafafa]">
        <Navbar mobileSearch={false} />
        <main className="flex-1 flex items-center justify-center py-12 px-4">
          <div className="w-full max-w-sm">
            <div className="bg-white rounded-3xl shadow-sm border border-[#e5e7eb] p-8">
              <OtpVerification
                email={otpEmail}
                autoResendOnMount
                onVerified={async () => {
                  if (!hasSupabaseBrowserConfig()) {
                    setError(authUnavailableMessage(locale));
                    return;
                  }
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
      {/* Visual only: the press that opens Google's window must still reach its
          iframe underneath, so the cover never intercepts pointer events. */}
      {leaving && <div className="contents pointer-events-none"><PageRouteLoading /></div>}
      <Navbar mobileSearch={false} />
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md">
          {/* Same card container as the client ("Crear cuenta de cliente") and
              professional registrations — clean white card, hairline border, soft
              shadow, p-8 — so the whole auth flow (login + both signups) is consistent. */}
          <div className="bg-white rounded-3xl shadow-sm border border-[#e5e7eb] p-8">
          <div className="text-center mb-8">
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
            <Button type="submit" size="lg" loading={submitting} disabled={submitting} className="mt-2">
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
            {/* Apple sign-in exists only inside the app; the website keeps its web-only login. */}
            {!browserRuntime && (
            <button
              type="button"
              onClick={handleApple}
              disabled={appleLoading || googleLoading}
              className={`w-full flex items-center justify-center gap-3 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${socialHint === "apple" ? "border-[#009FD9] bg-black text-white ring-2 ring-[#009FD9]/30" : "border-black bg-black text-white hover:bg-[#202020]"}`}
            >
              <svg aria-hidden="true" className="h-5 w-5 fill-current" viewBox="0 0 24 24"><path d="M17.05 12.54c-.03-3.01 2.46-4.48 2.57-4.55a5.5 5.5 0 0 0-4.33-2.34c-1.82-.19-3.58 1.09-4.5 1.09-.94 0-2.36-1.07-3.9-1.04A5.73 5.73 0 0 0 2.08 8.6c-2.09 3.62-.53 8.95 1.47 11.88 1 1.43 2.17 3.03 3.71 2.97 1.51-.06 2.08-.95 3.91-.95 1.81 0 2.35.95 3.92.91 1.62-.02 2.64-1.44 3.6-2.88a11.78 11.78 0 0 0 1.65-3.36 5.2 5.2 0 0 1-3.29-4.63ZM14.1 3.72A5.28 5.28 0 0 0 15.3 0a5.35 5.35 0 0 0-3.46 1.77 5.02 5.02 0 0 0-1.23 3.58 4.4 4.4 0 0 0 3.49-1.63Z" /></svg>
              {appleLoading ? t("redirecting") : locale === "en" ? "Continue with Apple" : "Continuar con Apple"}
            </button>
            )}
            {/* Google */}
            {browserRuntime ? (
              <GoogleSignInButton
                locale={locale}
                disabled={googleLoading || appleLoading}
                onCredential={handleGoogleCredential}
                onReturn={handleGoogleReturn}
                onOpen={handleGoogleOpen}
                onLeave={handleGoogleLeave}
                fallback={
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={googleLoading || appleLoading}
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
                }
              />
            ) : (
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={googleLoading || appleLoading}
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
            )}
          </div>

          {/* Social sign-in can create an account, so the terms must be visible before
              continuing here too — not only on the registration forms. */}
          <p className="mt-4 text-center text-xs leading-relaxed text-[#8a9aab]">
            {locale === "en" ? "By continuing, you accept the " : "Al continuar, aceptas los "}
            <Link href="/terminos" className="font-semibold text-[#009FD9]">{locale === "en" ? "Terms" : "Términos"}</Link>
            {locale === "en" ? " and the " : " y la "}
            <Link href="/privacidad" className="font-semibold text-[#009FD9]">{locale === "en" ? "Privacy Policy" : "Política de Privacidad"}</Link>
            {locale === "en" ? " of ContrataCR." : " de ContrataCR."}
          </p>

          <p className="text-center text-sm text-[#6b7280] mt-6">
            {t("noAccount")}{" "}
            <Link href={registerHref} className="text-[#009FD9] font-medium hover:underline">
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
