"use client";

import { useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { nativeSocialLink } from "@/lib/auth/native-social-login";
import { useNativeApp } from "@/hooks/use-native-app";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

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
    <section data-sign-in-methods className="border-t border-[#eef2f6] pt-6">
      <h3 className="text-sm font-semibold text-[#374151]">{english ? "Sign-in methods" : "Métodos de acceso"}</h3>
      <p className="mt-2 text-sm leading-6 text-[#6b7280]">{english ? "Connect another method to access this same account. Confirm it with the provider, even if it uses a different email." : "Conecta otro método para entrar a esta misma cuenta. Confírmalo con el proveedor, aunque use otro correo."}</p>
      {connectingApple && <p role="status" className="mt-3 rounded-xl bg-[#eff9fd] p-3 text-sm text-[#374151]">{ta("accountHelp")}</p>}
      <ul className="mt-4 overflow-hidden rounded-xl border border-[#dce5ee] bg-white divide-y divide-[#dce5ee]">
        {(["email", "google", "apple"] as const).map((provider) => {
          const connected = identities.some((identity) => identity.provider === provider);
          const label = provider === "email" ? (english ? "Email" : "Correo") : provider === "google" ? "Google" : "Apple";
          const connectButton = <button type="button" disabled={busy !== null} onClick={() => { if (provider !== "email") void connect(provider); }} className="min-h-11 font-semibold text-[#009FD9] disabled:opacity-60">{busy === provider ? (english ? "Connecting…" : "Conectando…") : (english ? "Connect" : "Conectar")}</button>;
          return <li key={provider} className="flex min-h-16 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm">
            <span className="shrink-0 font-semibold text-[#162543]">{label}</span>
            {connected ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{english ? "Connected" : "Conectado"}</span> : provider === "email" ? <button type="button" disabled={busy !== null} onClick={addPassword} className="min-h-11 font-semibold text-[#009FD9] disabled:opacity-60">{english ? "Add password" : "Agregar contraseña"}</button> : provider === "google" && !native ? (
              <div className="w-full min-w-0 shrink-0 sm:w-[200px]">
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
