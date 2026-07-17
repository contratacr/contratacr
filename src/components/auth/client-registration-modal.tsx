"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X, CheckCircle2, Circle,
  ArrowRight, ArrowLeft, AlertCircle, Loader2, RotateCcw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IdentityField } from "@/components/ui/identity-field";
import { cleanId, isValidId } from "@/lib/cedula";
import { cn } from "@/lib/utils";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";
import { SpamNotice } from "@/components/ui/spam-notice";
import { NAME_MAX_LENGTH, limitText } from "@/lib/text-limits";

// ─── Types ────────────────────────────────────────────────────────────────────

// Identity-FIRST, like the logged-in/no-cédula booking flow: the cédula is asked first and
// the official name auto-fills from the padrón (or a "No tengo cédula" manual name), THEN
// email + password — so a guest requesting a service never enters their identity twice.
type RegisterStep = "identity" | "email" | "password" | "otp";
type ModalView = "register" | "login";

const STEP_NUM: Record<RegisterStep, number> = {
  identity: 1, email: 2, password: 3, otp: 4,
};
const PENDING_BOOKING_IDENTITY_KEY = "ccr:pending-booking-identity";

export interface ClientRegistrationModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Context: pro name shown at top of modal */
  professionalName?: string;
}

// ─── Password checklist ───────────────────────────────────────────────────────

function PasswordChecklist({ password }: { password: string }) {
  const t = useTranslations("resetPassword");
  const rules = [
    { label: t("rule8"), ok: password.length >= 8 },
    { label: t("ruleUpper"), ok: /[A-Z]/.test(password) },
    { label: t("ruleLower"), ok: /[a-z]/.test(password) },
    { label: t("ruleNumber"), ok: /[0-9]/.test(password) },
    { label: t("ruleSpecial"), ok: /[!@#$%^&*]/.test(password) },
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
  const t = useTranslations("clientRegModal");
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
      setError(t("otpError"));
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
        <p className="text-sm text-[#6b7280] mb-1">{t("codeSentTo")}</p>
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
            pattern="[0-9]*"
            maxLength={6}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={verifying}
            autoComplete={i === 0 ? "one-time-code" : "off"}
            className="w-10 h-12 text-center text-lg font-bold border-2 rounded-xl border-[#e5e7eb] bg-white text-[#111827] focus:outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          />
        ))}
      </div>

      {verifying && (
        <div className="flex items-center justify-center gap-2 text-sm text-[#009FD9]">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("verifying")}
        </div>
      )}

      <p className="text-sm text-center text-[#6b7280]">
        {countdown > 0 ? (
          t.rich("resendIn", { seconds: countdown, strong: (c) => <strong className="text-[#374151]">{c}</strong> })
        ) : (
          <button
            type="button"
            onClick={resend}
            disabled={resending}
            className="inline-flex items-center gap-1.5 text-[#009FD9] font-medium hover:underline disabled:opacity-60"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {resending ? t("resending") : t("resendCode")}
          </button>
        )}
      </p>
      <SpamNotice className="text-center" />
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
  const t = useTranslations("clientRegModal");
  const tRp = useTranslations("resetPassword");
  const locale = useLocale();
  const [view, setView] = useState<ModalView>("register");
  const [step, setStep] = useState<RegisterStep>("identity");

  // Register state
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");   // auto-filled from the cédula (padrón)
  const [manualName, setManualName] = useState(""); // typed when "No tengo cédula"
  const [cedula, setCedula] = useState("");       // clean digits; "" when noCedula
  const [noCedula, setNoCedula] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Login state
  const [loginPassword, setLoginPassword] = useState("");

  // Async states
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateEmailDetected, setDuplicateEmailDetected] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);

  function reset() {
    setView("register");
    setStep("identity");
    setEmail("");
    setFullName("");
    setManualName("");
    setCedula("");
    setNoCedula(false);
    setPassword("");
    setConfirmPassword("");
    setLoginPassword("");
    setError(null);
    setDuplicateEmailDetected(false);
  }

  // Resolved identity: a national/DIMEX cédula auto-fills `fullName` from the padrón; the
  // "No tengo cédula" path types `manualName`. The cédula stays temporary until booking submit.
  const resolvedName = limitText((noCedula ? manualName : fullName).trim(), NAME_MAX_LENGTH);
  const cedulaClean = !noCedula ? cleanId(cedula) : "";
  const identityReady = noCedula
    ? manualName.trim().length > 1
    : !!cedulaClean && isValidId(cedulaClean) && resolvedName.length > 1;

  function handleClose() {
    reset();
    onClose();
  }

  // Cedula lookup removed — form uses manual name fields only.
  // Re-activate when api.digital.go.cr credentials are available:
  // async function lookupCedula() { ... }

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
      setError(tRp("passwordsDontMatch"));
      return;
    }
    setSubmitting(true);
    setError(null);
    const resolved = resolvedName;
    const supabase = createClient();

    // The ID is captured first so the booking can continue prefilled, but it is not
    // saved to the account until a real booking is created.
    const { data: signUpData, error: e } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: resolved,
          role: "client",
          onboarding_completed: true,
        },
      },
    });
    if (e) {
      setSubmitting(false);
      if (e.message.includes("already registered") || e.message.includes("already been registered")) {
        setDuplicateEmailDetected(true);
        setError(null);
        setView("login");
      } else {
        setError(e.message);
      }
      return;
    }
    // Supabase anti-enumeration: existing email → user with empty identities.
    if (Array.isArray(signUpData?.user?.identities) && signUpData!.user!.identities!.length === 0) {
      setSubmitting(false);
      setDuplicateEmailDetected(true);
      setError(null);
      setView("login");
      return;
    }

    // Save the client account shell only. The ID is kept in sessionStorage for the
    // booking modal and persisted later by /api/bookings if the request is sent.
    if (signUpData?.user?.id) {
      try {
        const res = await fetch("/api/register/client", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: signUpData.user.id, fullName: resolved }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok && json?.code === "cedula_taken") {
          setSubmitting(false);
          setError(locale === "en" ? "That ID is already registered. Sign in." : "Esta identificacion ya esta registrada. Inicia sesion.");
          setView("login");
          return;
        }
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(PENDING_BOOKING_IDENTITY_KEY, JSON.stringify({
            userId: signUpData.user.id,
            fullName: resolved,
            cedula: cedulaClean || "",
            noCedula,
            createdAt: Date.now(),
          }));
        }
      } catch {
        // Non-fatal — name will be saved when the session is established.
      }
    }

    setSubmitting(false);
    setStep("otp");
  }

  // Detect an existing account as soon as the EMAIL step is completed — a returning
  // user is routed straight to login (enter password) BEFORE we ask for a password +
  // confirm. Falls back to proceeding on any check failure (signUp still catches a dup).
  async function emailStepContinue() {
    setError(null);
    setCheckingEmail(true);
    try {
      const res = await fetch(`/api/check-availability?email=${encodeURIComponent(email.trim())}`);
      const json = await res.json().catch(() => ({}));
      if (json?.emailTaken) {
        setLoginPassword("");
        setDuplicateEmailDetected(true);
        setView("login");
      } else {
        setStep("password");
      }
    } catch {
      setStep("password");
    } finally {
      setCheckingEmail(false);
    }
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
      setError(t("loginError"));
      return;
    }
    handleClose();
    onSuccess();
  }

  // ── Step labels ────────────────────────────────────────────────────────────

  const currentStepNum = STEP_NUM[step];

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "app-bottom-sheet fixed inset-x-0 bottom-0 z-50",
            "w-full bg-white rounded-t-2xl shadow-2xl overflow-hidden sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[95vw] sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
            "max-h-[92vh] flex flex-col sm:max-h-[95vh]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:slide-in-from-bottom-4 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-bottom-0"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#f3f4f6] shrink-0">
            <div className="flex items-center gap-3">
              <ContrataCRLogo />
              {view === "register" && step !== "otp" && (
                <div className="flex items-center gap-1 ml-2">
                  {[1, 2, 3, 4].map((n) => (
                    <span
                      key={n}
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-300",
                        n <= currentStepNum ? "bg-[#009FD9] w-5" : "bg-[#e5e7eb] w-2.5"
                      )}
                    />
                  ))}
                  <span className="text-xs text-[#9ca3af] ml-1.5">
                    {currentStepNum}/4
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
              <p className="text-xs text-[#9ca3af]">{t("toContact")}</p>
              <p className="text-sm font-semibold text-[#1a2744]">{professionalName}</p>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">

            {/* ── LOGIN VIEW ─────────────────────────────────────────────────── */}
            {view === "login" && (
              <div className="flex flex-col gap-5">
                <div>
                  <h2 className="text-xl font-bold text-[#111827]">{t("loginTitle")}</h2>
                  {/* When we land here because the email already has an account, the amber
                      notice below is the single, more specific explanation — so the generic
                      subtitle is hidden to avoid two overlapping "use your password" lines. */}
                  {!duplicateEmailDetected && (
                    <p className="text-sm text-[#6b7280] mt-1">{t("loginSubtitle")}</p>
                  )}
                </div>

                {duplicateEmailDetected && (
                  <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-sm">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-800">{t("dupTitle")}</p>
                      <p className="text-amber-700 mt-0.5">{t("dupBody")}</p>
                    </div>
                  </div>
                )}

                {error && !duplicateEmailDetected && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                  </div>
                )}
                <Input
                  label={t("emailLabel")}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                />
                <Input
                  label={t("passwordLabel")}
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                />
                {/* Forgot-password — every login surface has it. Links to the standalone
                    reset page; does NOT touch the booking flow's login (which still closes
                    + continues via onSuccess on success). */}
                <a
                  href={`/${locale}/olvide-contrasena`}
                  className="self-start -mt-2.5 text-sm text-[#009FD9] hover:underline"
                >
                  {t("forgotPassword")}
                </a>
                {/* The "Iniciar sesión" submit button lives in the footer action bar
                    (consistent with the register flow's button) — NOT duplicated here. */}
              </div>
            )}

            {/* ── REGISTER VIEW ──────────────────────────────────────────────── */}
            {view === "register" && (
              <div className="flex flex-col gap-5">

                {/* Step titles */}
                <div>
                  <h2 className="text-xl font-bold text-[#111827]">
                    {step === "identity" && t("titleIdentity")}
                    {step === "email" && t("titleEmail")}
                    {step === "password" && t("titlePassword")}
                    {step === "otp" && t("titleOtp")}
                  </h2>
                  <p className="text-sm text-[#6b7280] mt-1">
                    {step === "identity" && t("subIdentity")}
                    {step === "email" && t("subEmail")}
                    {step === "password" && t("subPassword")}
                    {step === "otp" && t("subOtp")}
                  </p>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                  </div>
                )}

                {/* STEP: identity — cédula FIRST → official name auto-fills from the padrón
                    (read-only), OR a "No tengo cédula" manual name. Mirrors the booking
                    flow so the guest never enters their identity twice. */}
                {step === "identity" && (
                  <div className="flex flex-col gap-3">
                    {!noCedula ? (
                      <IdentityField
                        cedula={cedula}
                        fullName={fullName}
                        onCedulaChange={(c) => { setCedula(c); setError(null); }}
                        onFullNameChange={(name) => setFullName(limitText(name, NAME_MAX_LENGTH))}
                      />
                    ) : (
                      <Input
                        label={`${t("nameLabel")} *`}
                        placeholder={t("namePlaceholder")}
                        value={manualName}
                        maxLength={NAME_MAX_LENGTH}
                        onChange={(e) => setManualName(limitText(e.target.value, NAME_MAX_LENGTH))}
                        autoFocus
                      />
                    )}
                    {/* Brand-blue "No tengo cédula" escape (manual name, flagged unverified),
                        same pattern as the booking flow. */}
                    <button
                      type="button"
                      onClick={() => { setNoCedula((v) => !v); setError(null); }}
                      className="self-start text-xs font-semibold text-[#009FD9] hover:underline"
                    >
                      {noCedula ? t("haveCedula") : t("noCedula")}
                    </button>
                  </div>
                )}

                {/* STEP: email */}
                {step === "email" && (
                  <Input
                    label={t("emailLabel")}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    autoFocus
                  />
                )}

                {/* STEP: password */}
                {step === "password" && (
                  <div className="flex flex-col gap-4">
                    <div>
                      <Input
                        label={t("passwordLabel")}
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <PasswordChecklist password={password} />
                    </div>
                    <Input
                      label={t("confirmPassword")}
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      error={confirmPassword && password !== confirmPassword ? tRp("passwordsDontMatch") : undefined}
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
                  {step !== "identity" && (
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => {
                        setError(null);
                        if (step === "email") setStep("identity");
                        else if (step === "password") setStep("email");
                      }}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="md"
                    className="flex-1"
                    loading={submitting || checkingEmail}
                    disabled={
                      (step === "identity" && !identityReady) ||
                      (step === "email" && !email.includes("@")) ||
                      (step === "password" && (!isPasswordValid() || !confirmPassword))
                    }
                    onClick={() => {
                      setError(null);
                      if (step === "identity") setStep("email");
                      else if (step === "email") emailStepContinue();
                      else if (step === "password") handleSignUp();
                    }}
                  >
                    {step === "password"
                      ? submitting ? t("creatingAccount") : t("createAccount")
                      : <>{t("continue")} <ArrowRight className="h-4 w-4" /></>}
                  </Button>
                </div>
              ) : null}
              {view === "register" && step === "password" && (
                <p className="text-center text-xs text-[#9ca3af] mt-3">
                  {t.rich("terms", {
                    terms: (c) => <a href="/terminos" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#374151]">{c}</a>,
                    privacy: (c) => <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#374151]">{c}</a>,
                  })}
                </p>
              )}
              {view === "login" && (
                <div className="flex gap-3">
                  <Button variant="outline" size="md" onClick={() => { setView("register"); setError(null); }}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Button size="md" className="flex-1" loading={submitting} onClick={handleLogin}>
                    {submitting ? t("signingIn") : t("signIn")}
                  </Button>
                </div>
              )}

              {/* Toggle */}
              <p className="text-center text-sm text-[#6b7280]">
                {view === "register" ? (
                  <>
                    {t("haveAccount")}{" "}
                    <button
                      type="button"
                      onClick={() => { setView("login"); setError(null); setDuplicateEmailDetected(false); }}
                      className="text-[#009FD9] font-semibold hover:underline"
                    >
                      {t("signInLink")}
                    </button>
                  </>
                ) : (
                  <>
                    {t("noAccount")}{" "}
                    <button
                      type="button"
                      onClick={() => { setView("register"); setError(null); }}
                      className="text-[#009FD9] font-semibold hover:underline"
                    >
                      {t("signUpFree")}
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
