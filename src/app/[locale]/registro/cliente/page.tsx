"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CheckCircle2, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navbar } from "@/components/layout/navbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const schema = z.object({
  cedula: z.string().min(9, "Cédula inválida").max(12, "Cédula inválida"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

type FormData = z.infer<typeof schema>;

export default function RegisterClientPage() {
  const t = useTranslations("registration.client");
  const [fullName, setFullName] = useState("");
  const [loadingCedula, setLoadingCedula] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

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
              <CheckCircle2 className="h-10 w-10 text-[#2563EB]" />
            </div>
            <h1 className="text-2xl font-bold text-[#111827] mb-2">{t("success.title")}</h1>
            <p className="text-[#6b7280] mb-6">{t("success.desc")}</p>
            <Button size="lg" asChild>
              <Link href="/buscar">{t("success.button")}</Link>
            </Button>
          </div>
        </main>
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
              <span className="text-3xl">👤</span>
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
              <p className="text-sm text-[#1d4ed8] font-medium">🔐 {t("verifyNote")}</p>
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
                <CheckCircle2 className="h-5 w-5 text-[#2563EB] shrink-0" />
                <div>
                  <p className="text-xs text-[#6b7280]">{t("verifiedName")}</p>
                  <p className="text-sm font-semibold text-[#111827]">{fullName}</p>
                </div>
              </div>
            )}

            <Input label={t("email")} type="email" placeholder="tu@email.com" error={errors.email?.message} {...register("email")} />
            <Input label={t("password")} type="password" placeholder="••••••••" error={errors.password?.message} {...register("password")} />

            <Button type="submit" size="lg" className="mt-2" loading={submitting}>
              {submitting ? t("submitting") : <>{t("submit")} <ArrowRight className="h-4 w-4" /></>}
            </Button>

            <p className="text-center text-xs text-[#9ca3af]">
              {t("terms")}{" "}
              <Link href="/terminos" className="text-[#2563EB] hover:underline">{t("termsLink")}</Link>
            </p>
          </form>

          <p className="text-center text-sm text-[#6b7280] mt-6">
            {t("alreadyHaveAccount")}{" "}
            <Link href="/login" className="text-[#2563EB] font-medium hover:underline">{t("signIn")}</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
