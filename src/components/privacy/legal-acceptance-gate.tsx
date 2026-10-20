"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { isNativeAppRuntime } from "@/hooks/use-native-app";
import { createClient } from "@/lib/supabase/client";
import { LEGAL_VERSION } from "@/lib/privacy/legal-version";
import { CasillaDeTerminos } from "@/components/auth/casilla-de-terminos";

/** One affirmative acceptance per published version, including social accounts. */
export function LegalAcceptanceGate({ children, initialReceipt }: { children: ReactNode; initialReceipt?: { userId: string; accepted: boolean } | null }) {
  const { user, loading } = useAuth();
  const userId = user?.id;
  const locale = useLocale();
  const en = locale === "en";
  const pathname = usePathname();
  const exempt = /(?:^|\/)(terminos|privacidad|soporte|eliminar-cuenta|login)(?:\/|$)/.test(pathname);
  const [state, setState] = useState<{ userId: string; status: "ready" | "required" | "error" } | null>(() => initialReceipt ? { userId: initialReceipt.userId, status: initialReceipt.accepted ? "ready" : "required" } : null);
  const [retry, setRetry] = useState(0);
  const [choice, setChoice] = useState<{ userId: string; accepted: boolean } | null>(null);
  const accepted = choice?.userId === userId && choice?.accepted === true;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!userId || loading || exempt || initialReceipt?.userId === userId) return;
    const controller = new AbortController();
    fetch("/api/privacy/choices", { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("unavailable"); return response.json(); })
      .then(data => { if (!controller.signal.aborted) setState({ userId, status: data.requiresAcceptance ? "required" : "ready" }); })
      .catch(() => { if (!controller.signal.aborted) setState({ userId, status: "error" }); });
    return () => controller.abort();
  }, [userId, loading, exempt, retry, initialReceipt?.userId]); // Recheck on account changes, not auth token refreshes.
  if (!user || loading || exempt) return children;
  const status = state?.userId === user.id ? state.status : "loading";
  if (status === "ready") return children;
  async function submit() {
    if (!accepted || !user || saving) return;
    setSaving(true); setError(false);
    try {
      const response = await fetch("/api/privacy/choices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose: "terms", accepted: true, version: LEGAL_VERSION, locale: en ? "en" : "es", channel: isNativeAppRuntime() ? "native" : "web" }) });
      if (!response.ok) throw new Error("unavailable");
      setState({ userId: user.id, status: "ready" });
    } catch { setError(true); } finally { setSaving(false); }
  }
  return <main className="flex min-h-[100svh] items-center justify-center bg-white px-6 py-12 text-[#162543]" data-legal-acceptance>
    <section className="w-full max-w-md space-y-5" aria-busy={status === "loading" || saving}>
      <h1 className="text-2xl font-bold">{en ? "Terms and privacy" : "Términos y privacidad"}</h1>
      {status === "loading" ? <p role="status">{en ? "Checking your acceptance…" : "Consultando su aceptación…"}</p> : status === "error" ? <>
        <p>{en ? "Could not check your acceptance. Your session is preserved." : "No pudimos comprobar su aceptación. Su sesión se conserva."}</p>
        <button type="button" className="min-h-11 font-semibold text-[#0083b0]" onClick={() => setRetry(value => value + 1)}>{en ? "Retry" : "Reintentar"}</button>
      </> : <>
        <p className="text-sm leading-6 text-[#526176]">{en ? "Review the updated service rules and how we handle your data. Advertising and external AI have separate optional permissions." : "Revise las reglas actualizadas del servicio y cómo tratamos sus datos. La publicidad y la IA externa tienen permisos opcionales separados."}</p>
        <CasillaDeTerminos aceptado={accepted} onCambio={accepted => setChoice({ userId: user.id, accepted })} />
        <button type="button" disabled={!accepted || saving} onClick={() => void submit()} className="min-h-12 w-full rounded-full bg-[#009FD9] px-5 font-semibold text-white disabled:opacity-50">{saving ? (en ? "Saving…" : "Guardando…") : (en ? "Accept and continue" : "Aceptar y continuar")}</button>
        {error && <p role="alert" className="text-sm text-red-700">{en ? "Could not save. Please try again." : "No se pudo guardar. Inténtelo nuevamente."}</p>}
      </>}
      <button type="button" className="min-h-11 text-sm text-[#526176]" onClick={() => void createClient().auth.signOut()}>{en ? "Sign out" : "Cerrar sesión"}</button>
    </section>
  </main>;
}
