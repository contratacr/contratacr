"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Circle, Eye, EyeOff, ArrowRight, AlertCircle, Lock } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LandingFooter } from "@/components/landing/landing-footer";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Mínimo 8 caracteres")
      .regex(/[A-Z]/, "Al menos una mayúscula")
      .regex(/[a-z]/, "Al menos una minúscula")
      .regex(/[0-9]/, "Al menos un número")
      .regex(/[!@#$%^&*]/, "Al menos un carácter especial (!@#$%^&*)"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

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
          <span className={`text-xs ${r.ok ? "text-emerald-600" : "text-gray-400"}`}>
            {r.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const t = useTranslations("resetPassword");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const watchedPassword = watch("password") ?? "";

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password: data.password,
    });
    setSubmitting(false);
    if (updateError) {
      setError(t("error"));
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/dashboard/cliente"), 2500);
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center py-12 px-4">
          <div className="w-full max-w-sm text-center">
            <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-full bg-[#EBF5FB] mb-5">
              <CheckCircle2 className="h-10 w-10 text-[#009FD9]" />
            </div>
            <h1 className="text-2xl font-bold text-[#111827] mb-2">{t("doneTitle")}</h1>
            <p className="text-[#6b7280] text-sm">
              {t("doneBody")}
            </p>
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
              <Lock className="h-7 w-7 text-[#009FD9]" />
            </div>
            <ContrataCRLogo className="justify-center mb-4" />
            <h1 className="text-2xl font-bold text-[#111827]">{t("title")}</h1>
            <p className="text-[#6b7280] text-sm mt-1">
              {t("subtitle")}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 mb-4">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div>
              <Input
                label={t("newPassword")}
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                error={errors.password?.message}
                {...register("password")}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                }
              />
              <PasswordChecklist password={watchedPassword} />
            </div>
            <Input
              label={t("confirmPassword")}
              type={showConfirm ? "text" : "password"}
              placeholder="••••••••"
              error={errors.confirmPassword?.message}
              {...register("confirmPassword")}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  {showConfirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              }
            />
            <Button type="submit" size="lg" loading={submitting} className="mt-2">
              {submitting ? (
                t("updating")
              ) : (
                <>
                  {t("updatePassword")} <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-[#6b7280] mt-6">
            <Link href="/login" className="text-[#009FD9] font-medium hover:underline">
              {t("backToLogin")}
            </Link>
          </p>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
