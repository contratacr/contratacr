"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CheckCircle2, ArrowRight, Loader2, AlertCircle, User, Shield, Eye, EyeOff, Circle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navbar } from "@/components/layout/navbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { LandingFooter } from "@/components/landing/landing-footer";

const schema = z.object({
  cedula: z.string().min(9, "Cédula inválida").max(12, "Cédula inválida"),
  email: z.string().email("Email inválido"),
  password: z.string()
    .min(8, "Mínimo 8 caracteres")
    .regex(/[A-Z]/, "Al menos una mayúscula")
    .regex(/[a-z]/, "Al menos una minúscula")
    .regex(/[0-9]/, "Al menos un número")
    .regex(/[!@#$%^&*]/, "Al menos un carácter especial (!@#$%^&*)"),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

type FormData = z.infer<typeof schema>;

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
    <div className="flex flex-col gap-1 mt-1">
      {rules.map(r => (
        <div key={r.label} className="flex items-center gap-2">
          {r.ok
            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            : <Circle className="h-3.5 w-3.5 text-gray-300 shrink-0" />
          }
          <span className={`text-xs ${r.ok ? "text-emerald-600" : "text-gray-400"}`}>{r.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function RegisterClientPage() {
  const t = useTranslations("registration.client");
  const [fullName, setFullName] = useState("");
  const [loadingCedula, setLoadingCedula] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { register, handleSubmit, formState: { errors }, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const watchedPassword = watch("password") ?? "";

  async function lookupCedula(cedula: string) {
    if (cedula.length < 9) return;
    setLoadingCedula(true);
    try {
      const res = await fetch(`/api/cedula/${cedula}`);
      if (res.ok) {
        const data = await res.json();
        setFullName(data.fullName);
      }
    } catch {
      // non-critical — continue without name
    } finally {
      setLoadingCedula(false);
    }
  }

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: fullName || data.email.split("@")[0],
            cedula: data.cedula,
            role: "client",
          },
        },
      });
      if (signUpError) throw signUpError;
      setDone(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al registrarse";
      // Translate common Supabase error messages
      if (msg.includes("already registered") || msg.includes("already been registered")) {
        setError("Este email ya está registrado. ¿Querés iniciar sesión?");
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center py-12 px-4">
          <div className="w-full max-w-md text-center">
            <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-full bg-[#EBF5FB] mb-5">
              <CheckCircle2 className="h-10 w-10 text-[#009FD9]" />
            </div>
            <h1 className="text-2xl font-bold text-[#111827] mb-2">{t("success.title")}</h1>
            <p className="text-[#6b7280] mb-6">{t("success.desc")}</p>
            <Button size="lg" asChild>
              <Link href="/buscar">{t("success.button")}</Link>
            </Button>
          </div>
        </main>
        <LandingFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center py-10 px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-[#EBF5FB] mb-4">
              <User className="h-7 w-7 text-[#009FD9]" />
            </div>
            <h1 className="text-2xl font-bold text-[#111827]">{t("title")}</h1>
            <p className="text-[#6b7280] text-sm mt-1">{t("subtitle")}</p>
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-4">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="bg-[#EBF5FB] rounded-2xl p-4 border border-[#bfdbfe]">
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-[#009FD9] shrink-0 mt-0.5" />
                <p className="text-sm text-[#0089bb] font-medium">{t("verifyNote")}</p>
              </div>
            </div>

            <Input
              label={t("cedula")}
              placeholder="101230456"
              hint={t("cedulaHint")}
              error={errors.cedula?.message}
              {...register("cedula")}
              onBlur={(e) => lookupCedula(e.target.value)}
              rightIcon={loadingCedula ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
            />

            {fullName && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#EBF5FB] border border-[#bfdbfe]">
                <Shield className="h-5 w-5 text-[#009FD9] shrink-0" />
                <div>
                  <p className="text-xs text-[#6b7280]">{t("verifiedName")}</p>
                  <p className="text-sm font-semibold text-[#111827]">{fullName}</p>
                </div>
              </div>
            )}

            <Input label={t("email")} type="email" placeholder="tu@email.com" error={errors.email?.message} {...register("email")} />

            <div>
              <Input
                label={t("password")}
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                error={errors.password?.message}
                {...register("password")}
                rightIcon={
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />
              <PasswordChecklist password={watchedPassword} />
            </div>

            <Input
              label="Confirmar contraseña"
              type={showConfirm ? "text" : "password"}
              placeholder="••••••••"
              error={errors.confirmPassword?.message}
              {...register("confirmPassword")}
              rightIcon={
                <button type="button" onClick={() => setShowConfirm(v => !v)} className="text-gray-400 hover:text-gray-600">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />

            <Button type="submit" size="lg" className="mt-2" loading={submitting}>
              {submitting ? t("submitting") : <>{t("submit")} <ArrowRight className="h-4 w-4" /></>}
            </Button>

            <p className="text-center text-xs text-[#9ca3af]">
              {t("terms")}{" "}
              <Link href="/terminos" className="text-[#009FD9] hover:underline">{t("termsLink")}</Link>
            </p>
          </form>

          <p className="text-center text-sm text-[#6b7280] mt-6">
            {t("alreadyHaveAccount")}{" "}
            <Link href="/login" className="text-[#009FD9] font-medium hover:underline">{t("signIn")}</Link>
          </p>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
