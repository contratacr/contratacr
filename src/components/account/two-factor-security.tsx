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
  async function refresh() {
    const response = await fetch("/api/auth/session-mfa", { cache: "no-store" });
    if (!response.ok) throw new Error("Security unavailable");
    setState(await response.json()); setError(false);
  }
  useEffect(() => { const timer = window.setTimeout(() => { void refresh().catch(() => setError(true)); }, 0); return () => window.clearTimeout(timer); }, []);
  return <section data-account-mfa className="bg-white">
    <div className="flex min-h-11 items-center justify-between gap-4">
      <h3 className="text-sm font-semibold text-[#162543]">{en ? "Two-factor authentication" : "Verificación en dos pasos"}</h3>
      {state && <span className="text-sm text-[#52627a]">{state.enrolled ? (en ? "Enabled" : "Activada") : (en ? "Disabled" : "Desactivada")}</span>}
    </div>
    <p className="mt-1 text-xs leading-relaxed text-[#68778d]">{state?.isAdmin ? (en ? "Required for administrator accounts." : "Obligatoria para cuentas administradoras.") : (en ? "Use an authenticator app to protect your sign-in." : "Proteja el inicio de sesión con una app autenticadora.")}</p>
    {error && <p role="alert" className="mt-2 text-sm text-red-600">{en ? "Could not update security. Try again." : "No se pudo actualizar la seguridad. Inténtelo de nuevo."}</p>}
    {!state && <button className="min-h-11 text-sm text-[#009fd9]" onClick={() => void refresh().catch(() => setError(true))}>{en ? "Check status" : "Consultar estado"}</button>}
    {state && !mode && (!state.enrolled || !state.isAdmin) && <button className="min-h-11 text-sm font-semibold text-[#009fd9]" onClick={() => setMode(state.enrolled ? "disable" : "enable")}>{state.enrolled ? (en ? "Disable" : "Desactivar") : (en ? "Enable" : "Activar")}</button>}
    {state && mode && <div className="mt-4"><AdminMfa embedded administrator={state.isAdmin} enrolled={mode === "disable"} onCancel={() => setMode(null)} onVerified={async () => {
      if (mode === "disable") {
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
