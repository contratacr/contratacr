"use client";

import { useState } from "react";
import { Mail, Lock, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

/**
 * "Cuenta y seguridad" — manage how you log in: change email + password.
 *
 * OAUTH-AWARE: accounts created with Google/Facebook have no ContrataCR
 * password and their email is managed by the provider — for them we show a
 * clear note instead of fields that wouldn't work. Email/password accounts get
 * the full change-email + change-password flows (Supabase Auth, with
 * confirmation + friendly feedback).
 */
const inputClass =
  "w-full h-10 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

export function AccountSecuritySection({ showHeading = true }: { showHeading?: boolean }) {
  const { user } = useAuth();
  const locale = useLocale();

  // Email change
  const [emailMode, setEmailMode] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Password change
  const [pwMode, setPwMode] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  // Forgot-password escape hatch (sends the reset email).
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Detect OAuth (Google/Facebook) accounts — no password, provider-managed email.
  const oauthProvider = user?.app_metadata?.provider as string | undefined;
  const isOAuthAccount =
    oauthProvider === "google" ||
    oauthProvider === "facebook" ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user?.identities ?? []).some((id: any) => id.provider && id.provider !== "email");
  const providerLabel = oauthProvider === "facebook" ? "Facebook" : "Google";

  async function sendEmailChange() {
    if (!newEmail.trim()) return;
    setEmailError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) { setEmailError(error.message); return; }
    setEmailSent(true);
    setEmailMode(false);
  }

  async function savePassword() {
    setPwError(null);
    if (!currentPw) { setPwError("Ingresa tu contraseña actual."); return; }
    if (newPw.length < 8) { setPwError("La nueva contraseña debe tener al menos 8 caracteres."); return; }
    if (newPw !== confirmPw) { setPwError("Las contraseñas nuevas no coinciden."); return; }
    if (!user?.email) { setPwError("No pudimos validar tu cuenta. Vuelve a iniciar sesión."); return; }
    setPwSaving(true);
    const supabase = createClient();
    // Verify the CURRENT password by re-authenticating — Supabase validates the
    // hash for us (we never read/decrypt it). Same session, no emailed code.
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPw });
    if (signInErr) { setPwSaving(false); setPwError("Tu contraseña actual no es correcta."); return; }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwSaving(false);
    if (error) { setPwError(error.message); return; }
    setPwSaved(true);
    setPwMode(false);
    setCurrentPw(""); setNewPw(""); setConfirmPw("");
    setTimeout(() => setPwSaved(false), 4000);
  }

  async function sendReset() {
    if (!user?.email) return;
    setResetBusy(true);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/${locale}/reset-password`,
    });
    setResetBusy(false);
    setResetSent(true);
  }

  return (
    <div className="space-y-4">
      {showHeading && (
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[#009FD9]" />
          <h2 className="text-lg font-semibold text-[#111827]">Cuenta y seguridad</h2>
        </div>
      )}

      {/* Email */}
      <div className="bg-white rounded-2xl border border-[#e5e7eb] p-5">
        <div className="flex items-center gap-2 mb-2">
          <Mail className="h-4 w-4 text-[#6b7280]" />
          <h3 className="text-sm font-semibold text-[#374151]">Correo electrónico</h3>
        </div>
        {isOAuthAccount ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-[#111827] font-medium">{user?.email}</span>
            <p className="text-xs text-[#9ca3af]">
              Iniciaste sesión con {providerLabel}. Tu correo se administra desde esa cuenta y no puede cambiarse aquí.
            </p>
          </div>
        ) : emailSent ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
            ✓ Revisa tu bandeja — enviamos un correo de confirmación al nuevo email. El cambio se aplica al confirmarlo.
          </div>
        ) : emailMode ? (
          <div className="flex flex-col gap-3">
            <input
              type="email"
              className={inputClass}
              placeholder="nuevo@correo.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            {emailError && <p className="text-xs text-red-500">{emailError}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={sendEmailChange} disabled={!newEmail.trim()}>Enviar confirmación</Button>
              <Button size="sm" variant="outline" onClick={() => { setEmailMode(false); setNewEmail(""); setEmailError(null); }}>Cancelar</Button>
            </div>
            <p className="text-xs text-[#9ca3af]">Te enviaremos un correo de confirmación al nuevo email.</p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-[#111827] font-medium">{user?.email}</span>
            <button onClick={() => setEmailMode(true)} className="text-sm text-[#009FD9] hover:underline whitespace-nowrap">
              Cambiar email
            </button>
          </div>
        )}
      </div>

      {/* Password */}
      <div className="bg-white rounded-2xl border border-[#e5e7eb] p-5">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="h-4 w-4 text-[#6b7280]" />
          <h3 className="text-sm font-semibold text-[#374151]">Contraseña</h3>
        </div>
        {isOAuthAccount ? (
          <p className="text-xs text-[#9ca3af]">
            Iniciaste sesión con {providerLabel}. Tu acceso se administra desde esa cuenta, así que no usas una contraseña en ContrataCR.
          </p>
        ) : pwSaved ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
            ✓ Tu contraseña fue actualizada.
          </div>
        ) : pwMode ? (
          <div className="flex flex-col gap-3">
            <input
              type={showPw ? "text" : "password"}
              className={inputClass}
              placeholder="Contraseña actual"
              autoComplete="current-password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
            />
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                className={inputClass}
                placeholder="Nueva contraseña (mínimo 8 caracteres)"
                autoComplete="new-password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
              />
              <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <input
              type={showPw ? "text" : "password"}
              className={inputClass}
              placeholder="Repite la nueva contraseña"
              autoComplete="new-password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
            />
            {pwError && <p className="text-xs text-red-500">{pwError}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={savePassword} loading={pwSaving} disabled={pwSaving || !currentPw || !newPw || !confirmPw}>Guardar contraseña</Button>
              <Button size="sm" variant="outline" onClick={() => { setPwMode(false); setCurrentPw(""); setNewPw(""); setConfirmPw(""); setPwError(null); }}>Cancelar</Button>
            </div>
            {/* Forgot-password escape hatch — sends the reset email. */}
            {resetSent ? (
              <p className="text-xs text-emerald-600">✓ Te enviamos un enlace a {user?.email} para restablecer tu contraseña.</p>
            ) : (
              <button type="button" onClick={sendReset} disabled={resetBusy} className="self-start text-xs text-[#009FD9] hover:underline disabled:opacity-60">
                {resetBusy ? "Enviando…" : "¿Olvidaste tu contraseña actual? Te enviamos un enlace por correo"}
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-[#9ca3af]">••••••••</span>
            <button onClick={() => setPwMode(true)} className="text-sm text-[#009FD9] hover:underline whitespace-nowrap">
              Cambiar contraseña
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
