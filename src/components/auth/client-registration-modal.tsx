"use client";

import { useState, useRef, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X, Shield, Eye, EyeOff, CheckCircle2, Circle,
  ArrowRight, ArrowLeft, AlertCircle, Loader2, Building2, RotateCcw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";

// ─── Types ────────────────────────────────────────────────────────────────────

type RegisterStep = "email" | "cedula" | "verify" | "password" | "otp";
type ModalView = "register" | "login";

const STEP_NUM: Record<RegisterStep, number> = {
  email: 1, cedula: 2, verify: 3, password: 4, otp: 5,
};

export interface ClientRegistrationModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Context: pro name shown at top of modal */
  professionalName?: string;
}

// ─── Password checklist ───────────────────────────────────────────────────────

function PasswordChecklist({ password }: { password: string }) {
  const rules = [
    { label: "Mínimo 8 caracteres", ok: password.length >= 8 },
    { label: "Una letra mayúscula", ok: /[A-Z]/.test(password) },
    { label: "Una letra minúscula", ok: /[a-z]/.test(password) },
    { label: "Un número", ok: /[0-9]/.test(password) },
    { label: "Un carácter especial (!@#$%^&*)", ok: /[!@#$%^&*]/.test(password) },
  ];
  if (!password) return null;
  return (
    <div className="flex flex-col gap-1 mt-1.5">
      {rules.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          {r.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-gray-300 shrink-0" />
          )}
          <span className={`text-xs ${r.ok ? "text-emerald-600" : "text-gray-400"}`}>{r.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Inline OTP ───────────────────────────────────────────────────────────────

function OtpStep({ email, onVerified }: { email: string; onVerified: () => void }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [resending, setResending] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { refs.current[0]?.focus(); }, []);
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  async function verify(token: string) {
    setVerifying(true);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
    setVerifying(false);
    if (e) {
      setError("Código incorrecto o expirado.");
      setDigits(["", "", "", "", "", ""]);
      setTimeout(() => refs.current[0]?.focus(), 50);
    } else {
      onVerified();
    }
  }

  function handleChange(i: number, val: string) {
    if (val.length > 1) {
      const pasted = val.replace(/\D/g, "").slice(0, 6);
      const next = [...digits];
      for (let j = 0; j < 6; j++) next[j] = pasted[j] ?? "";
      setDigits(next);
      refs.current[Math.min(pasted.length, 5)]?.focus();
      if (pasted.length === 6) verify(pasted);
      return;
    }
    const d = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    if (d && i < 5) refs.current[i + 1]?.focus();
    if (next.every((x) => x !== "")) verify(next.join(""));
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  }

  async function resend() {
    setResending(true);
    const supabase = createClient();
    await supabase.auth.resend({ email, type: "signup" });
    setResending(false);
    setCountdown(60);
    setDigits(["", "", "", "", "", ""]);
    setTimeout(() => refs.current[0]?.focus(), 50);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-[#6b7280] mb-1">Código enviado a</p>
        <p className="font-semibold text-[#1a2744] text-sm truncate">{email}</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex gap-2 justify-center">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={verifying}
            className="w-10 h-12 text-center text-lg font-bold border-2 rounded-xl border-[#e5e7eb] bg-white text-[#111827] focus:outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/20 transition-all disabled:opacity-60"
          />
        ))}
      </div>

      {verifying && (
        <div className="flex items-center justify-center gap-2 text-sm text-[#009FD9]">
          <Loader2 className="h-4 w-4 animate-spin" /> Verificando…
        </div>
      )}

      <p className="text-sm text-center text-[#6b7280]">
        {countdown > 0 ? (
          <>Reenviar en <strong className="text-[#374151]">{countdown}s</strong></>
        ) : (
          <button
            type="button"
            onClick={resend}
            disabled={resending}
            className="inline-flex items-center gap-1.5 text-[#009FD9] font-medium hover:underline disabled:opacity-60"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {resending ? "Reenviando…" : "Reenviar código"}
          </button>
        )}
      </p>
      <p className="text-xs text-center text-[#9ca3af]">Revisá también tu carpeta de spam.</p>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function ClientRegistrationModal({
  open,
  onClose,
  onSuccess,
  professionalName,
}: ClientRegistrationModalProps) {
  const [view, setView] = useState<ModalView>("register");
  const [step, setStep] = useState<RegisterStep>("email");

  // Register state
  const [email, setEmail] = useState("");
  const [cedula, setCedula] = useState("");
  const [fullName, setFullName] = useState("");
  const [manualName, setManualName] = useState("");
  const [useManualName, setUseManualName] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Login state
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPw, setShowLoginPw] = useState(false);

  // Async states
  const [loadingCedula, setLoadingCedula] = useState(false);
  const [cedulaError, setCedulaError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setView("register");
    setStep("email");
    setEmail("");
    setCedula("");
    setFullName("");
    setManualName("");
    setUseManualName(false);
    setPassword("");
    setConfirmPassword("");
    setLoginPassword("");
    setError(null);
    setCedulaError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  // ── Cedula lookup ──────────────────────────────────────────────────────────

  async function lookupCedula() {
    const digits = cedula.replace(/\D/g, "");
    if (digits.length < 9) return;
    setLoadingCedula(true);
    setCedulaError(null);
    setFullName("");
    try {
      const res = await fetch(`/api/cedula/${digits}`);
      if (res.ok) {
        const data = await res.json();
        setFullName(data.fullName);
        setUseManualName(false);
        setStep("verify");
      } else if (res.status === 400) {
        setCedulaError("Formato de cédula inválido. Verificá e intentá de nuevo.");
      } else {
        // 404 or 503 → manual name
        setUseManualName(true);
      }
    } catch {
      setUseManualName(true);
    } finally {
      setLoadingCedula(false);
    }
  }

  // ── Password validate ──────────────────────────────────────────────────────

  function isPasswordValid() {
    return (
      password.length >= 8 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[!@#$%^&*]/.test(password)
    );
  }

  // ── SignUp ─────────────────────────────────────────────────────────────────

  async function handleSignUp() {
    if (!isPasswordValid()) return;
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const resolved = useManualName ? manualName : fullName;
    const supabase = createClient();
    const { error: e } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: resolved,
          cedula: cedula.replace(/\D/g, ""),
          role: "client",
          onboarding_completed: true,
        },
      },
    });
    setSubmitting(false);
    if (e) {
      if (e.message.includes("already registered") || e.message.includes("already been registered")) {
        setError("Este correo ya está registrado.");
        setView("login");
      } else {
        setError(e.message);
      }
      return;
    }
    setStep("otp");
  }

  // ── Login ──────────────────────────────────────────────────────────────────

  async function handleLogin() {
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.auth.signInWithPassword({
      email,
      password: loginPassword,
    });
    setSubmitting(false);
    if (e) {
      setError("Correo o contraseña incorrectos.");
      return;
    }
    handleClose();
    onSuccess();
  }

  // ── Step labels ────────────────────────────────────────────────────────────

  const stepLabels: Record<RegisterStep, string> = {
    email:    "Correo",
    cedula:   "Identidad",
    verify:   "Confirmar",
    password: "Contraseña",
    otp:      "Verificar",
  };

  const currentStepNum = STEP_NUM[step];

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-[95vw] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden",
            "max-h-[95vh] flex flex-col",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#f3f4f6] shrink-0">
            <div className="flex items-center gap-3">
              <ContrataCRLogo />
              {view === "register" && step !== "otp" && (
                <div className="flex items-center gap-1 ml-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-300",
                        n <= currentStepNum ? "bg-[#009FD9] w-5" : "bg-[#e5e7eb] w-2.5"
                      )}
                    />
                  ))}
                  <span className="text-xs text-[#9ca3af] ml-1.5">
                    {currentStepNum}/5
                  </span>
                </div>
              )}
            </div>
            <Dialog.Close asChild>
              <button className="p-2 rounded-xl text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#374151] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Professional context */}
          {professionalName && (
            <div className="px-6 py-3 bg-[#f9fafb] border-b border-[#f3f4f6] shrink-0">
              <p className="text-xs text-[#9ca3af]">Para contactar a</p>
              <p className="text-sm font-semibold text-[#1a2744]">{professionalName}</p>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">

            {/* ── LOGIN VIEW ─────────────────────────────────────────────────── */}
            {view === "login" && (
              <div className="flex flex-col gap-5">
                <div>
                  <h2 className="text-xl font-bold text-[#111827]">Iniciá sesión</h2>
                  <p className="text-sm text-[#6b7280] mt-1">
                    Usá tu correo y contraseña de ContrataCR.
                  </p>
                </div>
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                  </div>
                )}
                <Input
                  label="Correo electrónico"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                />
                <Input
                  label="Contraseña"
                  type={showLoginPw ? "text" : "password"}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  rightIcon={
                    <button type="button" onClick={() => setShowLoginPw((v) => !v)} className="text-gray-400 hover:text-gray-600">
                      {showLoginPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  }
                />
                <Button size="lg" loading={submitting} className="w-full" onClick={handleLogin}>
                  {submitting ? "Iniciando sesión…" : "Iniciar sesión"}
                </Button>
              </div>
            )}

            {/* ── REGISTER VIEW ──────────────────────────────────────────────── */}
            {view === "register" && (
              <div className="flex flex-col gap-5">

                {/* Step titles */}
                <div>
                  <h2 className="text-xl font-bold text-[#111827]">
                    {step === "email" && "Tu correo electrónico"}
                    {step === "cedula" && "Tu cédula de identidad"}
                    {step === "verify" && "Confirmá tu identidad"}
                    {step === "password" && "Creá tu contraseña"}
                    {step === "otp" && "Código de verificación"}
                  </h2>
                  <p className="text-sm text-[#6b7280] mt-1">
                    {step === "email" && "Ingresá el correo que usarás para tu cuenta."}
                    {step === "cedula" && "Consultamos el Registro Civil para verificar tu identidad."}
                    {step === "verify" && "Verificá que la información sea correcta."}
                    {step === "password" && "Elegí una contraseña segura para tu cuenta."}
                    {step === "otp" && "Ingresá el código de 6 dígitos enviado a tu correo."}
                  </p>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                  </div>
                )}

                {/* STEP: email */}
                {step === "email" && (
                  <Input
                    label="Correo electrónico"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    autoFocus
                  />
                )}

                {/* STEP: cedula */}
                {step === "cedula" && (
                  <div className="flex flex-col gap-4">
                    <div className="bg-[#EBF5FB] rounded-xl p-3 border border-[#bfdbfe] flex items-start gap-2">
                      <Shield className="h-4 w-4 text-[#009FD9] shrink-0 mt-0.5" />
                      <p className="text-sm text-[#0089bb] font-medium">
                        Información obtenida del Registro Civil de Costa Rica
                      </p>
                    </div>
                    <Input
                      label="Número de cédula"
                      placeholder="101234567"
                      hint="Cédula CR (9 dígitos), DIMEX (11-12) o NITE (10)"
                      value={cedula}
                      onChange={(e) => { setCedula(e.target.value); setCedulaError(null); setUseManualName(false); setFullName(""); }}
                      error={cedulaError ?? undefined}
                      inputMode="numeric"
                      rightIcon={loadingCedula ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
                    />
                    {useManualName && !loadingCedula && (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs text-[#9ca3af]">
                          No encontramos tu cédula. Ingresá tu nombre manualmente.
                        </p>
                        <Input
                          label="Tu nombre completo"
                          placeholder="Juan Carlos Pérez González"
                          value={manualName}
                          onChange={(e) => setManualName(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* STEP: verify */}
                {step === "verify" && (
                  <div className="flex flex-col gap-4">
                    <div className="rounded-2xl border-2 border-[#009FD9] bg-[#EBF5FB] p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <Building2 className="h-4 w-4 text-[#009FD9]" />
                        <p className="text-xs font-semibold text-[#009FD9] uppercase tracking-wide">
                          Registro Civil de Costa Rica
                        </p>
                      </div>
                      <p className="text-xs text-[#6b7280] mb-1">Nombre completo</p>
                      <p className="text-xl font-bold text-[#111827]">{fullName}</p>
                      <p className="text-xs text-[#9ca3af] mt-2">Cédula: {cedula}</p>
                    </div>
                    <p className="text-sm font-medium text-[#374151]">
                      ¿Esta información es correcta?
                    </p>
                  </div>
                )}

                {/* STEP: password */}
                {step === "password" && (
                  <div className="flex flex-col gap-4">
                    <div>
                      <Input
                        label="Contraseña"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        rightIcon={
                          <button type="button" onClick={() => setShowPassword((v) => !v)} className="text-gray-400 hover:text-gray-600">
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        }
                      />
                      <PasswordChecklist password={password} />
                    </div>
                    <Input
                      label="Confirmar contraseña"
                      type={showConfirm ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      error={confirmPassword && password !== confirmPassword ? "Las contraseñas no coinciden" : undefined}
                      rightIcon={
                        <button type="button" onClick={() => setShowConfirm((v) => !v)} className="text-gray-400 hover:text-gray-600">
                          {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      }
                    />
                  </div>
                )}

                {/* STEP: otp */}
                {step === "otp" && (
                  <OtpStep email={email} onVerified={() => { handleClose(); onSuccess(); }} />
                )}

              </div>
            )}
          </div>

          {/* Footer */}
          {step !== "otp" && (
            <div className="px-6 py-4 border-t border-[#f3f4f6] shrink-0 flex flex-col gap-3">
              {/* Actions */}
              {view === "register" ? (
                <div className="flex gap-3">
                  {step !== "email" && (
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => {
                        setError(null);
                        if (step === "cedula") setStep("email");
                        else if (step === "verify") { setStep("cedula"); setFullName(""); }
                        else if (step === "password") setStep(fullName ? "verify" : "cedula");
                      }}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="md"
                    className="flex-1"
                    loading={submitting || loadingCedula}
                    disabled={
                      (step === "email" && !email.includes("@")) ||
                      (step === "cedula" && cedula.replace(/\D/g, "").length < 9 && !useManualName) ||
                      (step === "cedula" && useManualName && !manualName.trim()) ||
                      (step === "password" && (!isPasswordValid() || !confirmPassword))
                    }
                    onClick={() => {
                      setError(null);
                      if (step === "email") setStep("cedula");
                      else if (step === "cedula") lookupCedula();
                      else if (step === "verify") setStep("password");
                      else if (step === "password") handleSignUp();
                    }}
                  >
                    {step === "cedula" && loadingCedula
                      ? "Verificando…"
                      : step === "password"
                      ? submitting ? "Creando cuenta…" : "Crear cuenta"
                      : <>Continuar <ArrowRight className="h-4 w-4" /></>}
                  </Button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <Button variant="outline" size="md" onClick={() => { setView("register"); setError(null); }}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Button size="md" className="flex-1" loading={submitting} onClick={handleLogin}>
                    {submitting ? "Iniciando sesión…" : "Iniciar sesión"}
                  </Button>
                </div>
              )}

              {/* Toggle */}
              <p className="text-center text-sm text-[#6b7280]">
                {view === "register" ? (
                  <>
                    ¿Ya tenés cuenta?{" "}
                    <button
                      type="button"
                      onClick={() => { setView("login"); setError(null); }}
                      className="text-[#009FD9] font-semibold hover:underline"
                    >
                      Iniciá sesión
                    </button>
                  </>
                ) : (
                  <>
                    ¿No tenés cuenta?{" "}
                    <button
                      type="button"
                      onClick={() => { setView("register"); setError(null); }}
                      className="text-[#009FD9] font-semibold hover:underline"
                    >
                      Registrate gratis
                    </button>
                  </>
                )}
              </p>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
