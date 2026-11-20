"use client";

import { Mail } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { nativeSocialLink } from "@/lib/auth/native-social-login";
import { useNativeApp } from "@/hooks/use-native-app";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

function MethodIcon({ provider }: { provider: "email" | "google" | "apple" }) {
  if (provider === "email") return <Mail aria-hidden="true" className="h-5 w-5 text-[#64748b]" />;
  if (provider === "google") return <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>;
  return <svg aria-hidden="true" className="h-5 w-5 fill-current" viewBox="0 0 24 24"><path d="M17.05 12.54c-.03-3.01 2.46-4.48 2.57-4.55a5.5 5.5 0 0 0-4.33-2.34c-1.82-.19-3.58 1.09-4.5 1.09-.94 0-2.36-1.07-3.9-1.04A5.73 5.73 0 0 0 2.08 8.6c-2.09 3.62-.53 8.95 1.47 11.88 1 1.43 2.17 3.03 3.71 2.97 1.51-.06 2.08-.95 3.91-.95 1.81 0 2.35.95 3.92.91 1.62-.02 2.64-1.44 3.6-2.88a11.78 11.78 0 0 0 1.65-3.36 5.2 5.2 0 0 1-3.29-4.63ZM14.1 3.72A5.28 5.28 0 0 0 15.3 0a5.35 5.35 0 0 0-3.46 1.77 5.02 5.02 0 0 0-1.23 3.58 4.4 4.4 0 0 0 3.49-1.63Z" /></svg>;
}

export function SignInMethods() {
  const { user } = useAuth();
  const native = useNativeApp();
  const locale = useLocale();
  const ta = useTranslations("auth.appleAccount");
  const connectingApple = useSyncExternalStore(() => () => {}, () => new URLSearchParams(window.location.search).get("connect") === "apple", () => false);
  const english = locale === "en";
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const identities = user?.identities ?? [];

  async function connect(provider: "google" | "apple") {
    setBusy(provider);
    setMessage(null);
    const supabase = createClient();
    const { data: session } = await supabase.auth.getUser();
    if (!session.user || session.user.id !== user?.id) {
      setMessage(english ? "Sign in again before connecting another method." : "Vuelve a iniciar sesión antes de conectar otro método.");
      setBusy(null);
      return;
    }
    try {
      const outcome = await nativeSocialLink(provider, supabase);
      if (outcome === "linked") {
        window.dispatchEvent(new Event("ccr:profile-updated"));
        setBusy(null);
        return;
      }
      if (outcome === "cancelled") {
        setBusy(null);
        return;
      }
      // The browser retains its authenticated OAuth linking flow. It must never
      // fall back to sign-in, even when the native provider is unavailable.
      const next = `${english ? "/en" : ""}/dashboard/profesional?tab=cuenta`;
      const redirectTo = `${window.location.origin}/auth/callback?flow=link&locale=${locale}&next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.linkIdentity({ provider, options: { redirectTo } });
      if (error) throw error;
    } catch {
      setMessage(english ? "We couldn't connect this method. Your existing sign-in methods still work." : "No pudimos conectar este método. Tus accesos actuales siguen funcionando.");
      setBusy(null);
    }
  }

  async function connectGoogleCredential(token: string, nonce: string) {
    setBusy("google");
    setMessage(null);
    try {
      const supabase = createClient();
      const current = await supabase.auth.getUser();
      if (current.error || !current.data.user || current.data.user.id !== user?.id) {
        throw new Error("The account changed before connecting Google.");
      }
      // Google's browser button returns the same kind of verified token as the
      // native sheet. Link it to the signed-in account; never sign into another.
      const { error } = await supabase.auth.linkIdentity({ provider: "google", token, nonce });
      if (error) throw error;
      window.dispatchEvent(new Event("ccr:profile-updated"));
    } catch {
      setMessage(english ? "We couldn't connect this method. Your existing sign-in methods still work." : "No pudimos conectar este método. Tus accesos actuales siguen funcionando.");
    } finally {
      setBusy(null);
    }
  }

  async function addPassword() {
    if (!user?.email) return;
    setBusy("email");
    setMessage(null);
    const response = await fetch("/api/auth/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, redirectTo: `${window.location.origin}${english ? "/en" : ""}/reset-password` }),
    }).catch(() => null);
    setMessage(response?.ok ? (english ? "Check your email to set a password for this same account." : "Revisa tu correo para establecer una contraseña para esta misma cuenta.") : (english ? "We couldn't send the email. Please try again." : "No pudimos enviar el correo. Intenta de nuevo."));
    setBusy(null);
  }

  return (
    <section data-sign-in-methods data-security-group="methods" className="border-t border-[#e5e7eb] pt-6">
      <h3 className="text-sm font-semibold text-[#374151]">{english ? "Sign-in methods" : "Métodos de acceso"}</h3>
      <p className="mt-2 text-sm leading-6 text-[#6b7280]">{english ? "Choose how to sign in to your account." : "Elige cómo entrar a tu cuenta."}</p>
      {connectingApple && <p role="status" className="mt-3 rounded-xl bg-[#eff9fd] p-3 text-sm text-[#374151]">{ta("accountHelp")}</p>}
      <ul className="mt-3 space-y-1">
        {(["email", "google", "apple"] as const).map((provider) => {
          const connected = identities.some((identity) => identity.provider === provider);
          const label = provider === "email" ? (english ? "Email" : "Correo") : provider === "google" ? "Google" : "Apple";
          const connectButton = <button type="button" disabled={busy !== null} onClick={() => { if (provider !== "email") void connect(provider); }} className="min-h-11 text-right font-semibold text-[#009FD9] transition-colors hover:text-[#0089bb] disabled:opacity-60">{busy === provider ? (english ? "Connecting…" : "Conectando…") : (english ? "Connect" : "Conectar")}</button>;
          return <li key={provider} className="flex min-h-16 items-center justify-between gap-4 py-2 text-sm">
            <span className="flex shrink-0 items-center gap-3 font-semibold text-[#162543]"><span className="flex h-6 w-6 items-center justify-center" aria-hidden="true"><MethodIcon provider={provider} /></span>{label}</span>
            {connected ? <span className="text-sm text-[#64748b]">{english ? "Connected" : "Conectado"}</span> : provider === "email" ? <button type="button" disabled={busy !== null} onClick={addPassword} className="min-h-11 text-right font-semibold text-[#009FD9] transition-colors hover:text-[#0089bb] disabled:opacity-60">{english ? "Add password" : "Agregar contraseña"}</button> : provider === "google" && !native ? (
              <div className="w-32 min-w-0 shrink-0">
                <GoogleSignInButton locale={locale} disabled={busy !== null}
                  fallback={<div className="flex h-11 justify-end">{connectButton}</div>}
                  onCredential={connectGoogleCredential}
                />
              </div>
            ) : connectButton}
          </li>;

        })}
      </ul>
      {message && <p role="alert" className="mt-3 text-sm text-red-700">{message}</p>}
    </section>
  );
}
