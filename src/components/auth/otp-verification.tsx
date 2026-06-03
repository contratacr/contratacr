"use client";

import { useState, useRef, useEffect } from "react";
import { Mail, AlertCircle, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface OtpVerificationProps {
  email: string;
  onVerified: () => void;
}

export function OtpVerification({ email, onVerified }: OtpVerificationProps) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  async function verifyOtp(token: string) {
    setVerifying(true);
    setError(null);
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "signup",
    });
    setVerifying(false);
    if (otpError) {
      setError("Código incorrecto o expirado. Verificá e intentá de nuevo.");
      setDigits(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } else {
      onVerified();
    }
  }

  function handleChange(index: number, value: string) {
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, "").slice(0, 6);
      const next = [...digits];
      for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? "";
      setDigits(next);
      const focusIdx = Math.min(pasted.length, 5);
      inputRefs.current[focusIdx]?.focus();
      if (pasted.length === 6) verifyOtp(pasted);
      return;
    }
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
    if (next.every((d) => d !== "")) verifyOtp(next.join(""));
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
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
    setTimeout(() => inputRefs.current[0]?.focus(), 50);
  }

  return (
    <div className="text-center">
      <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-[#EBF5FB] mb-5">
        <Mail className="h-8 w-8 text-[#009FD9]" />
      </div>
      <h2 className="text-xl font-bold text-[#111827] mb-2">Verificá tu correo</h2>
      <p className="text-[#6b7280] text-sm mb-1">
        Ingresá el código de 6 dígitos enviado a
      </p>
      <p className="text-sm font-semibold text-[#1a2744] mb-6 truncate">{email}</p>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 mb-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2 justify-center mb-6">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={verifying}
            className="w-11 h-14 text-center text-xl font-bold border-2 rounded-xl border-[#e5e7eb] bg-white text-[#111827] focus:outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/20 transition-all disabled:opacity-60"
          />
        ))}
      </div>

      {verifying && (
        <div className="flex items-center justify-center gap-2 text-sm text-[#009FD9] mb-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
          Verificando…
        </div>
      )}

      <p className="text-sm text-[#6b7280]">
        {countdown > 0 ? (
          <>
            Reenviar código en{" "}
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
            {resending ? "Reenviando…" : "Reenviar código"}
          </button>
        )}
      </p>
      <p className="text-xs text-[#9ca3af] mt-2">Revisá también tu carpeta de spam.</p>
    </div>
  );
}
