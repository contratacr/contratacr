"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { PhoneInput, isPhoneComplete } from "@/components/ui/phone-input";
import { OtpVerification } from "@/components/auth/otp-verification";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CheckCircle2, Eye, EyeOff, User } from "lucide-react";
import { PROVINCES } from "@/lib/data/cr-geography";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils";
import { IdentityField, type IdentityResult } from "@/components/ui/identity-field";
import { cleanId, detectIdType, isValidId } from "@/lib/cedula";

export default function RegisterClientPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [fullName, setFullName] = useState("");
  const [cedula, setCedula] = useState("");
  const [identity, setIdentity] = useState<IdentityResult | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [provinciaId, setProvinciaId] = useState("");
  const [cantonId, setCantonId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  const [oauthPhoto, setOauthPhoto] = useState<string | null>(null);

  const selectedProvincia = PROVINCES.find((p) => p.id === provinciaId);
  const cantons = selectedProvincia?.cantons ?? [];

  // Pre-fill from OAuth user
  useEffect(() => {
    if (authLoading) return;
    if (user) {
      const name = (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || "";
      const photo = (user.user_metadata?.avatar_url as string) || (user.user_metadata?.picture as string) || null;
      setFullName(name);
      setEmail(user.email ?? "");
      setOauthPhoto(photo);
    }
  }, [user, authLoading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPhoneError(null);

    if (!fullName.trim()) { setError("El nombre es requerido."); return; }
    if (!user && !email.trim()) { setError("El correo es requerido."); return; }
    if (!user && password.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
    if (!user && password !== confirmPassword) { setError("Las contraseñas no coinciden."); return; }

    // The account holder's phone is REQUIRED — client↔professional coordination
    // happens by WhatsApp/call, so without it they can't reach each other.
    if (!isPhoneComplete(phone)) {
      setPhoneError("Ingresa un número de teléfono válido — lo usamos para que los profesionales te contacten.");
      return;
    }

    // Cédula required + 18+ gate. National cédulas must be found in the padrón
    // (the electoral roll only contains citizens 18+) — this blocks minors. A
    // DIMEX/NITE can't be age-checked here, so it's accepted on format.
    const cleanCedula = cleanId(cedula);
    if (!isValidId(cleanCedula)) {
      setError("Ingresa un número de identificación válido (CR: 9 dígitos · DIMEX: 11-12 · NITE: 10).");
      return;
    }
    if (detectIdType(cleanCedula) === "cedula" && (!identity || !identity.found)) {
      setError("No pudimos confirmar tu identidad ni tu mayoría de edad con esa cédula. Si tu cédula es nueva o eres extranjero, abre un ticket en el Centro de soporte.");
      return;
    }

    setSubmitting(true);

    try {
      let userId: string | undefined;

      if (!user) {
        // New email/password signup
        const supabase = createClient();
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // onboarding_completed lets middleware send them straight to their
            // panel after verifying — never back to the role-selection screen.
            data: { role: "client", full_name: fullName, cedula: cleanCedula, onboarding_completed: true },
          },
        });

        if (signUpError) {
          if (signUpError.message.toLowerCase().includes("already registered")) {
            setError("Ya existe una cuenta con ese correo. Inicia sesión.");
          } else {
            setError(signUpError.message);
          }
          setSubmitting(false);
          return;
        }

        // Supabase anti-enumeration: existing email → user with empty identities.
        if (Array.isArray(data.user?.identities) && data.user!.identities!.length === 0) {
          setError("Este correo ya está registrado. Inicia sesión.");
          setSubmitting(false);
          return;
        }

        userId = data.user?.id;
      } else {
        userId = user.id;
      }

      // Upsert profile via API
      const res = await fetch("/api/register/client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          fullName: fullName.trim(),
          cedula: cleanCedula,
          phone: phone.trim(),
          provinciaId: provinciaId || null,
          cantonId: cantonId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al crear cuenta.");
        setSubmitting(false);
        return;
      }

      // New email/password accounts must verify their email via OTP before the
      // account is considered complete. OAuth users are already verified.
      if (!user) {
        setOtpEmail(email);
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Error inesperado. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (otpEmail) {
    return (
      <div className="min-h-screen flex flex-col bg-[#fafafa]">
        <Navbar />
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-sm">
            <div className="bg-white rounded-3xl shadow-sm border border-[#e5e7eb] p-8">
              <OtpVerification email={otpEmail} onVerified={() => { setOtpEmail(null); setSuccess(true); }} />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col bg-[#fafafa]">
        <Navbar />
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#EBF5FB] mx-auto mb-5">
              <CheckCircle2 className="h-10 w-10 text-[#009FD9]" />
            </div>
            <h1 className="text-2xl font-bold text-[#111827] mb-2">¡Bienvenido a ContrataCR!</h1>
            <p className="text-[#6b7280] mb-8">
              Tu cuenta está lista. Ahora puedes buscar y contratar profesionales cerca de ti.
            </p>
            <Button size="lg" className="w-full" onClick={() => router.push("/dashboard/cliente")}>
              Ir a mi panel
            </Button>
            <Button variant="outline" size="lg" className="w-full mt-3" onClick={() => router.push("/buscar")}>
              Buscar profesionales
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const inputClass =
    "w-full h-11 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-sm border border-[#e5e7eb] p-8">
            <div className="text-center mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EBF5FB] mx-auto mb-3">
                <User className="h-6 w-6 text-[#009FD9]" />
              </div>
              <h1 className="text-2xl font-bold text-[#111827]">Crear cuenta de cliente</h1>
              <p className="text-sm text-[#6b7280] mt-1">Encuentra profesionales cerca de ti. Gratis.</p>
            </div>

            {/* OAuth banner */}
            {user && (
              <div className="flex items-center gap-3 bg-[#EBF5FB] border border-[#bfdbfe] rounded-xl px-4 py-3 mb-5">
                {oauthPhoto ? (
                  <img src={oauthPhoto} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
                ) : (
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-[#009FD9] text-white text-sm font-semibold">
                      {getInitials(fullName)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#009FD9] font-semibold">Identidad confirmada</p>
                  <p className="text-sm font-bold text-[#111827] truncate">{fullName || user.email}</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-[#009FD9] shrink-0" />
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Cédula → padrón auto-fill (name comes from the padrón; also our
                  18+ gate). The client does not type their name when found. */}
              <IdentityField
                cedula={cedula}
                fullName={fullName}
                onCedulaChange={setCedula}
                onFullNameChange={setFullName}
                onResult={setIdentity}
              />

              {!user && (
                <>
                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">Correo electrónico <span className="text-red-500">*</span></label>
                    <input
                      type="email"
                      className={inputClass}
                      placeholder="tu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">Contraseña <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        className={cn(inputClass, "pr-11")}
                        placeholder="Mínimo 8 caracteres"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151] transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">Confirmar contraseña <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input
                        type={showConfirm ? "text" : "password"}
                        className={cn(inputClass, "pr-11", confirmPassword && password !== confirmPassword && "border-red-400 focus:ring-red-400")}
                        placeholder="Repite tu contraseña"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151] transition-colors"
                      >
                        {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {confirmPassword && password !== confirmPassword && (
                      <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden.</p>
                    )}
                  </div>
                </>
              )}

              <PhoneInput
                label="Teléfono"
                required
                value={phone}
                onChange={(v) => { setPhone(v); setPhoneError(null); }}
                error={phoneError ?? undefined}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-[#374151] block mb-1.5">
                    Provincia <span className="text-[#9ca3af] font-normal">(opcional)</span>
                  </label>
                  <select
                    className={cn(inputClass, "cursor-pointer")}
                    value={provinciaId}
                    onChange={(e) => { setProvinciaId(e.target.value); setCantonId(""); }}
                  >
                    <option value="">Selecciona</option>
                    {PROVINCES.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-[#374151] block mb-1.5">
                    Cantón <span className="text-[#9ca3af] font-normal">(opcional)</span>
                  </label>
                  <select
                    className={cn(inputClass, "cursor-pointer", !provinciaId && "opacity-50")}
                    value={cantonId}
                    onChange={(e) => setCantonId(e.target.value)}
                    disabled={!provinciaId}
                  >
                    <option value="">Selecciona</option>
                    {cantons.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button type="submit" size="lg" className="w-full mt-1" loading={submitting} disabled={submitting}>
                {submitting ? "Creando cuenta..." : user ? "Guardar y continuar" : "Crear cuenta gratis"}
              </Button>

              <p className="text-center text-xs text-[#9ca3af]">
                Al registrarte aceptas nuestros{" "}
                <a href="/terminos" className="underline hover:text-[#374151]">Términos de uso</a>.
              </p>

              <div className="text-center text-sm text-[#6b7280]">
                ¿Ya tienes cuenta?{" "}
                <a href="/login" className="text-[#009FD9] font-medium hover:underline">
                  Inicia sesión
                </a>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
