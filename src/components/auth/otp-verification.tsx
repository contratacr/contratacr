"use client";

import { useState, useRef, useEffect } from "react";
import { useLocale } from "next-intl";
import { AlertCircle, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";
import { SpamNotice } from "@/components/ui/spam-notice";
import { writeStoredMode } from "@/hooks/use-mode";

interface OtpVerificationProps {
  email: string;
  /** Called after successful verification. If omitted the component redirects by role automatically. */
  onVerified?: () => void;
}

export function OtpVerification({ email, onVerified }: OtpVerificationProps) {
  const router = useRouter();
  const locale = useLocale();
  const isEn = locale === "en";
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [resending, setResending] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    containerRef.current?.scrollIntoView({ block: "start", inline: "nearest" });
    window.requestAnimationFrame(() => {
      inputRefs.current[0]?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  async function verify(token: string) {
    setVerifying(true);
    setError(null);
    const supabase = createClient();
    const { data, error: otpError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "signup",
    });
    setVerifying(false);

    if (otpError) {
      setError(isEn ? "Incorrect or expired code. Request a new one." : "Codigo incorrecto o expirado. Solicita uno nuevo.");
      setDigits(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus({ preventScroll: true }), 50);
      return;
    }

    if (onVerified) {
      onVerified();
    } else {
      // Redirect based on role from the newly created session.
      const role = data.user?.user_metadata?.role as string | undefined;
      const isProfessional = role === "professional";
      writeStoredMode(isProfessional ? "offer" : "use");
      router.push(isProfessional ? "/dashboard/profesional?mode=offer" : "/dashboard/profesional?mode=use");
    }
  }

  function handleChange(index: number, value: string) {
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, "").slice(0, 6);
      const next = [...digits];
      for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? "";
      setDigits(next);
      inputRefs.current[Math.min(pasted.length, 5)]?.focus({ preventScroll: true });
      if (pasted.length === 6) verify(pasted);
      return;
    }

    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < 5) inputRefs.current[index + 1]?.focus({ preventScroll: true });
    if (next.every((d) => d !== "")) verify(next.join(""));
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus({ preventScroll: true });
    }
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    const supabase = createClient();
    await supabase.auth.resend({ email, type: "signup" });
    setResending(false);
    setCountdown(60);
    setDigits(["", "", "", "", "", ""]);
    setTimeout(() => inputRefs.current[0]?.focus({ preventScroll: true }), 50);
  }

  return (
    <div ref={containerRef} className="scroll-mt-24 text-center">
      <h1 className="text-xl font-bold text-[#111827]">{isEn ? "Verify your email" : "Verifica tu correo"}</h1>
      <p className="text-sm text-[#6b7280] mt-1.5 mb-6">
        {isEn ? "Enter the 6-digit code we sent to" : "Ingresa el codigo de 6 digitos que enviamos a"}{" "}
        <strong className="text-[#111827]">{email}</strong>.
      </p>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 mb-4 text-left">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2 justify-center mb-6">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={verifying}
            autoComplete={i === 0 ? "one-time-code" : "off"}
            className="w-11 h-14 text-center text-xl font-bold border-2 rounded-xl border-[#e5e7eb] bg-white text-[#111827] focus:outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          />
        ))}
      </div>

      {verifying ? (
        <div className="flex items-center justify-center gap-2 text-sm text-[#009FD9] mb-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
          {isEn ? "Verifying..." : "Verificando..."}
        </div>
      ) : (
        <div className="h-4 mb-4" />
      )}

      <p className="text-sm text-[#6b7280]">
        {countdown > 0 ? (
          <>
            {isEn ? "Resend code in" : "Reenviar codigo en"}{" "}
            <strong className="text-[#374151]">{countdown}s</strong>
          </>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="inline-flex items-center gap-1.5 text-[#009FD9] font-medium hover:underline disabled:opacity-60"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {resending ? (isEn ? "Resending..." : "Reenviando...") : (isEn ? "Resend code" : "Reenviar codigo")}
          </button>
        )}
      </p>
      <SpamNotice className="mt-2" />
    </div>
  );
}
