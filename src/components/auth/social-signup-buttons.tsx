"use client";

import { useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createClient, hasSupabaseBrowserConfig } from "@/lib/supabase/client";
import { isNativeAppRuntime } from "@/hooks/use-native-app";
import { nativeSocialSignIn } from "@/lib/auth/native-social-login";

// "Continuar con Google/Apple" for the REGISTRATION forms: the same providers
// as /login, but the round trip returns HERE (next = the current page) so the
// person continues the same form with their identity already connected.
// Apple exists only inside the app; the website keeps its web-only login.
export function SocialSignupButtons({ nextPath }: { nextPath?: string }) {
  const locale = useLocale();
  const t = useTranslations("auth.login");
  // "unknown" until hydration, so a browser never sees the app's Apple button
  // flash and the app never sees the web-only layout.
  const runtime = useSyncExternalStore(
    () => () => {},
    () => (isNativeAppRuntime() ? "native" : "browser"),
    () => "unknown" as const,
  );
  const [loading, setLoading] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function callbackUrl() {
    const next = nextPath ?? window.location.pathname + window.location.search;
    return `${window.location.origin}/auth/callback?flow=oauth&locale=${locale}&next=${encodeURIComponent(next)}`;
  }

  async function start(provider: "google" | "apple") {
    setLoading(provider);
    setError(null);
    if (!hasSupabaseBrowserConfig()) {
      setError(locale === "en"
        ? "Sign-in is temporarily unavailable. Please try again in a few minutes."
        : "El acceso no está disponible temporalmente. Intenta de nuevo en unos minutos.");
      setLoading(null);
      return;
    }
    const supabase = createClient();
    if (isNativeAppRuntime()) {
      // Inside the app the platform sheet signs the person in without leaving
      // ContrataCR; the callback then returns them to this same form.
      try {
        const outcome = await nativeSocialSignIn(provider, supabase);
        if (outcome === "signed-in") {
          // Same-origin path, never the absolute URL: the server origin can
          // differ from the one the WebView loaded.
          const callback = callbackUrl().replace("flow=oauth", "flow=native");
          window.location.assign(callback.slice(callback.indexOf("/auth/callback")));
          return;
        }
        if (outcome === "cancelled") {
          setLoading(null);
          return;
        }
        // "unavailable": provider not configured for this platform → web flow.
      } catch (nativeError) {
        setError(nativeError instanceof Error ? nativeError.message : String(nativeError));
        setLoading(null);
        return;
      }
    }
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {runtime === "native" && (
        <button
          type="button"
          onClick={() => start("apple")}
          disabled={loading !== null}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#111827] bg-[#111827] px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60"
        >
          <svg aria-hidden="true" className="h-5 w-5 fill-current" viewBox="0 0 24 24"><path d="M17.05 12.54c-.03-3.01 2.46-4.48 2.57-4.55a5.5 5.5 0 0 0-4.33-2.34c-1.82-.19-3.58 1.09-4.5 1.09-.94 0-2.36-1.07-3.9-1.04A5.73 5.73 0 0 0 2.08 8.6c-2.09 3.62-.53 8.95 1.47 11.88 1 1.43 2.17 3.03 3.71 2.97 1.51-.06 2.08-.95 3.91-.95 1.81 0 2.35.95 3.92.91 1.62-.02 2.64-1.44 3.6-2.88a11.78 11.78 0 0 0 1.65-3.36 5.2 5.2 0 0 1-3.29-4.63ZM14.1 3.72A5.28 5.28 0 0 0 15.3 0a5.35 5.35 0 0 0-3.46 1.77 5.02 5.02 0 0 0-1.23 3.58 4.4 4.4 0 0 0 3.49-1.63Z" /></svg>
          {loading === "apple" ? t("redirecting") : locale === "en" ? "Continue with Apple" : "Continuar con Apple"}
        </button>
      )}
      <button
        type="button"
        onClick={() => start("google")}
        disabled={loading !== null}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm font-medium text-[#374151] transition-colors hover:bg-[#f9fafb] disabled:opacity-60"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        {loading === "google" ? t("redirecting") : t("continueGoogle")}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="relative my-1" aria-hidden>
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[#e5e7eb]" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-4 text-xs text-[#9ca3af]">{t("or")}</span>
        </div>
      </div>
    </div>
  );
}
