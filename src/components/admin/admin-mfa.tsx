"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ContrataCRLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";

export function AdminMfa({ enrolled, onVerified }: { enrolled: boolean; onVerified: () => Promise<void> }) {
  const en = useLocale() === "en";
  const [setup, setSetup] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function startSetup() {
    setBusy(true); setError("");
    try {
      const auth = createClient().auth;
      const { data: factors, error: listError } = await auth.mfa.listFactors();
      if (listError) throw listError;
      // An interrupted setup never deletes an active authenticator.
      for (const factor of factors.all.filter(f => f.factor_type === "totp" && f.status === "unverified" && f.friendly_name === "ContrataCR Admin")) {
        const { error } = await auth.mfa.unenroll({ factorId: factor.id });
        if (error) throw error;
      }
      const { data, error } = await auth.mfa.enroll({ factorType: "totp", friendlyName: "ContrataCR Admin", issuer: "ContrataCR" });
      if (error) throw error;
      const qr = data.totp.qr_code.startsWith("data:image/") ? data.totp.qr_code : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.totp.qr_code)}`;
      setSetup({ id: data.id, qr, secret: data.totp.secret });
    } catch { setError(en ? "Could not set up the authenticator. Try again." : "No se pudo configurar el autenticador. Inténtelo de nuevo."); }
    finally { setBusy(false); }
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const auth = createClient().auth;
      let factorId = setup?.id;
      if (!factorId) {
        const { data, error } = await auth.mfa.listFactors();
        if (error) throw error;
        factorId = data.totp[0]?.id;
      }
      if (!factorId) throw new Error("Missing factor");
      const { error } = await auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      await onVerified();
    } catch { setCode(""); setError(en ? "The code could not be verified. Enter the current code from your authenticator." : "No se pudo verificar el código. Ingrese el código actual de su autenticador."); }
    finally { setBusy(false); }
  }
  return (
    <main data-admin-mfa className="flex min-h-dvh items-center justify-center bg-[#f5f8fa] px-5 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="mb-7 flex justify-center"><ContrataCRLogo /></div>
        <h1 className="text-xl font-bold text-[#162543]">{en ? "Two-factor authentication" : "Verificación en dos pasos"}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{enrolled
          ? (en ? "Enter the 6-digit code from your authenticator to continue." : "Ingrese el código de 6 dígitos de su autenticador para continuar.")
          : (en ? "Protect your administrator account with an authenticator app." : "Proteja su cuenta administradora con una app autenticadora.")}</p>
        {setup && <div className="mt-5">
          <p className="text-sm text-slate-600">{en ? "Scan this QR code with your authenticator." : "Escanee este QR con su autenticador."}</p>
          {/* Private enrollment material stays in component memory, never in logs or analytics. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt={en ? "Authenticator setup QR" : "QR para configurar el autenticador"} className="mx-auto my-3 h-48 w-48" />
          <p className="mb-3 text-xs text-slate-500">{en ? "Keep the manual key in a safe place in case you lose your device." : "Guarde la clave manual en un lugar seguro por si pierde el dispositivo."}</p>
          <details className="mb-4 text-sm text-slate-600"><summary>{en ? "Enter key manually" : "Ingresar clave manualmente"}</summary><code data-totp-secret className="mt-2 block break-all select-all">{setup.secret}</code></details>
        </div>}
        {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
        {enrolled || setup ? <form onSubmit={verify} className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-[#162543]">{en ? "Verification code" : "Código de verificación"}
            <input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 text-center text-xl tracking-[0.4em]" />
          </label>
          <Button type="submit" loading={busy} disabled={busy || code.length !== 6} className="w-full">{en ? "Continue" : "Continuar"}</Button>
        </form> : <Button onClick={() => void startSetup()} loading={busy} disabled={busy} className="mt-5 w-full">{en ? "Set up authenticator" : "Configurar autenticador"}</Button>}
        <button type="button" disabled={busy} className="mt-5 w-full text-sm text-slate-500" onClick={async () => { await createClient().auth.signOut({ scope: "local" }); window.location.assign(en ? "/en/login" : "/login"); }}>{en ? "Sign out" : "Cerrar sesión"}</button>
      </div>
    </main>
  );
}
