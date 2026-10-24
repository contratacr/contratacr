"use client";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { AdminMfa } from "@/components/admin/admin-mfa";

type SecurityState = { isAdmin: boolean; enrolled: boolean };
export function TwoFactorSecurity() {
  const en = useLocale() === "en";
  const router = useRouter();
  const [state, setState] = useState<SecurityState | null>(null);
  const [mode, setMode] = useState<"enable" | "disable" | null>(null);
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(true);
  async function refresh(signal?: AbortSignal) {
    const response = await fetch("/api/auth/session-mfa", { cache: "no-store", signal });
    if (!response.ok) throw new Error("Security unavailable");
    const next = await response.json();
    if (!signal?.aborted) { setState(next); setError(false); setChecking(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void refresh(controller.signal).catch(() => { if (!controller.signal.aborted) { setError(true); setChecking(false); } });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, []);
  return <section data-account-mfa data-security-group="mfa" className="border-t border-[#e5e7eb] bg-white pt-6">
    <div className="flex min-h-11 items-center justify-between gap-4">
      <h3 className="text-sm font-semibold text-[#162543]">{en ? "Two-factor authentication" : "Verificación en dos pasos"}</h3>
      <span className="w-28 shrink-0 text-right text-sm text-[#52627a]" aria-live="polite">{state ? (state.enrolled ? (en ? "Enabled" : "Activada") : (en ? "Disabled" : "Desactivada")) : (en ? "Checking…" : "Comprobando…")}</span>
    </div>
    <p className="mt-1 text-xs leading-relaxed text-[#68778d]">{en ? "Protect your sign-in with an authenticator app." : "Proteja el inicio de sesión con una app autenticadora."}</p>
    {!mode && <div className="min-h-11">
      {(!state || !state.enrolled || !state.isAdmin) && <button type="button" disabled={checking} className="min-h-11 text-sm font-semibold text-[#009fd9] disabled:cursor-wait" onClick={() => {
        if (!state) { setChecking(true); void refresh().catch(() => { setError(true); setChecking(false); }); }
        else setMode(state.enrolled ? "disable" : "enable");
      }}>{state ? (state.enrolled ? (en ? "Disable" : "Desactivar") : (en ? "Enable" : "Activar")) : checking ? (en ? "Checking…" : "Comprobando…") : (en ? "Try again" : "Reintentar")}</button>}
    </div>}
    {error && <p role="alert" className="mt-2 text-sm text-red-600">{en ? "Could not update security. Try again." : "No se pudo actualizar la seguridad. Inténtelo de nuevo."}</p>}
    {state && mode && <div className="mt-4"><AdminMfa embedded administrator={state.isAdmin} enrolled={mode === "disable"} onCancel={() => setMode(null)} onVerified={async () => {
      if (mode === "disable") {
        if (state.isAdmin) throw new Error("Administrator MFA must remain enabled");
        const auth = createClient().auth;
        const { data, error } = await auth.mfa.listFactors();
        if (error) throw error;
        for (const factor of data.totp) {
          const { error } = await auth.mfa.unenroll({ factorId: factor.id });
          if (error) throw error;
        }
        const { error: refreshError } = await auth.refreshSession();
        if (refreshError) throw refreshError;
      }
      await refresh(); setMode(null); router.refresh();
    }} /></div>}
  </section>;
}
