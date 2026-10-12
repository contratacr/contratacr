"use client";

import { useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { nativeSocialLink } from "@/lib/auth/native-social-login";

export function SignInMethods() {
  const { user } = useAuth();
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
    <section className="border-t border-[#eef2f6] pt-4">
      <h3 className="text-sm font-semibold text-[#374151]">{english ? "Sign-in methods" : "Métodos de acceso"}</h3>
      <p className="mt-1 text-sm text-[#6b7280]">{english ? "Connect another method to access this same account. Confirm it with the provider, even if it uses a different email." : "Conecta otro método para entrar a esta misma cuenta. Confírmalo con el proveedor, aunque use otro correo."}</p>
      {connectingApple && <p role="status" className="mt-3 rounded-xl bg-[#eff9fd] p-3 text-sm text-[#374151]">{ta("accountHelp")}</p>}
      <ul className="mt-3 space-y-3">
        {(["email", "google", "apple"] as const).map((provider) => {
          const connected = identities.some((identity) => identity.provider === provider);
          const label = provider === "email" ? (english ? "Email" : "Correo") : provider === "google" ? "Google" : "Apple";
          return <li key={provider} className="flex items-center justify-between gap-3 text-sm">
            <span>{label}</span>
            {connected ? <span className="text-emerald-700">{english ? "Connected" : "Conectado"}</span> : provider === "email" ? <button type="button" disabled={busy !== null} onClick={addPassword} className="font-semibold text-[#009FD9] disabled:opacity-60">{english ? "Add password" : "Agregar contraseña"}</button> : <button type="button" disabled={busy !== null} onClick={() => connect(provider)} className="font-semibold text-[#009FD9] disabled:opacity-60">{busy === provider ? (english ? "Connecting…" : "Conectando…") : (english ? "Connect" : "Conectar")}</button>}
          </li>;
        })}
      </ul>
      {message && <p role="alert" className="mt-3 text-sm text-red-700">{message}</p>}
    </section>
  );
}
