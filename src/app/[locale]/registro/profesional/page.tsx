"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CheckCircle2, ArrowRight, ArrowLeft, Loader2, AlertCircle, Shield, Eye, EyeOff, Circle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navbar } from "@/components/layout/navbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, PROVINCES, getCantonsByProvince } from "@/lib/data/cr-geography";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const step1Schema = z.object({
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

const step2Schema = z.object({
  category: z.string().min(1, "Seleccioná una categoría"),
  province: z.string().min(1, "Seleccioná una provincia"),
  canton: z.string().min(1, "Seleccioná un cantón"),
  whatsapp: z.string().min(8, "Número inválido").max(12),
});

const step3Schema = z.object({
  bio: z.string().min(30, "Mínimo 30 caracteres").max(500),
  yearsExperience: z.string().optional(),
  hourlyRate: z.string().optional(),
});

type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;
type Step3Data = z.infer<typeof step3Schema>;

function StepIndicator({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {labels.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all",
            i < current ? "bg-[#009FD9] text-white"
              : i === current ? "bg-[#009FD9] text-white ring-4 ring-[#009FD9]/20"
              : "bg-[#e5e7eb] text-[#9ca3af]"
          )}>
            {i < current ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
          </div>
          <span className={cn("text-sm font-medium hidden sm:block", i === current ? "text-[#009FD9]" : "text-[#9ca3af]")}>
            {label}
          </span>
          {i < labels.length - 1 && (
            <div className={cn("h-px w-8 sm:w-12 transition-all", i < current ? "bg-[#009FD9]" : "bg-[#e5e7eb]")} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function RegisterProfessionalPage() {
  const t = useTranslations("registration.pro");
  const tCat = useTranslations("categories");
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState("");
  const [loadingCedula, setLoadingCedula] = useState(false);
  const [selectedProvince, setSelectedProvince] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [whatsappValue, setWhatsappValue] = useState("");
  const [whatsappFormatted, setWhatsappFormatted] = useState("");

  // Persist step data for final submission
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null);
  const [step2Data, setStep2Data] = useState<Step2Data | null>(null);

  const cantons = getCantonsByProvince(selectedProvince);

  const form1 = useForm<Step1Data>({ resolver: zodResolver(step1Schema) });
  const form2 = useForm<Step2Data>({ resolver: zodResolver(step2Schema) });
  const form3 = useForm<Step3Data>({ resolver: zodResolver(step3Schema) });

  const watchedPassword = form1.watch("password") ?? "";

  function handleWhatsappChange(raw: string) {
    const digits = raw.replace(/\D/g, "");
    setWhatsappValue(digits);
    if (digits.length === 8 && /^[678]/.test(digits)) {
      setWhatsappFormatted(`+506 ${digits.slice(0, 4)}-${digits.slice(4)}`);
    } else {
      setWhatsappFormatted(digits);
    }
    form2.setValue("whatsapp", digits);
  }

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
      // non-critical
    } finally {
      setLoadingCedula(false);
    }
  }

  function onStep1(data: Step1Data) {
    setStep1Data(data);
    setStep(1);
  }

  function onStep2(data: Step2Data) {
    setStep2Data(data);
    setStep(2);
  }

  async function onStep3(data: Step3Data) {
    if (!step1Data || !step2Data) return;
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const resolvedName = fullName || step1Data.email.split("@")[0];

      // 1. Create auth user + trigger auto-creates the profile row
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: step1Data.email,
        password: step1Data.password,
        options: {
          data: {
            full_name: resolvedName,
            cedula: step1Data.cedula,
            role: "professional",
          },
        },
      });
      if (signUpError) throw signUpError;

      const userId = signUpData.user?.id;
      if (!userId) throw new Error("No se pudo crear la cuenta. Intentá de nuevo.");

      // 2. Create professionals record via server route (uses service_role, bypasses RLS)
      const proRes = await fetch("/api/register/professional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          fullName: resolvedName,
          category: step2Data.category,
          province: step2Data.province,
          canton: step2Data.canton,
          whatsapp: step2Data.whatsapp,
          bio: data.bio,
          yearsExperience: data.yearsExperience,
          hourlyRate: data.hourlyRate,
        }),
      });

      if (!proRes.ok) {
        const { error: proErr } = await proRes.json();
        throw new Error(proErr ?? "Error al crear tu perfil de profesional.");
      }

      setDone(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al registrarse";
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
              <Link href="/buscar">{t("success.viewProfile")}</Link>
            </Button>
          </div>
        </main>
        <LandingFooter />
      </div>
    );
  }

  const stepLabels = [t("steps.identity"), t("steps.service"), t("steps.profile")];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-10 px-4">
        <div className="mx-auto max-w-lg">
          <div className="text-center mb-2">
            <h1 className="text-2xl font-bold text-[#111827]">{t("title")}</h1>
            <p className="text-[#6b7280] text-sm mt-1">{t("subtitle")}</p>
          </div>
          <StepIndicator current={step} labels={stepLabels} />

          {error && (
            <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-4">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Step 1 */}
          {step === 0 && (
            <form onSubmit={form1.handleSubmit(onStep1)} className="flex flex-col gap-4">
              <div className="bg-[#EBF5FB] rounded-2xl p-4 border border-[#bfdbfe]">
                <div className="flex items-start gap-2">
                  <Shield className="h-4 w-4 text-[#009FD9] shrink-0 mt-0.5" />
                  <p className="text-sm text-[#0089bb] font-medium">{t("verifyNote")}</p>
                </div>
              </div>
              <Input
                label={t("cedula")}
                placeholder={t("cedulaPlaceholder")}
                hint={t("cedulaHint")}
                error={form1.formState.errors.cedula?.message}
                {...form1.register("cedula")}
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
              <Input label={t("email")} type="email" placeholder={t("emailPlaceholder")} error={form1.formState.errors.email?.message} {...form1.register("email")} />
              <div>
                <Input
                  label={t("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder={t("passwordPlaceholder")}
                  error={form1.formState.errors.password?.message}
                  {...form1.register("password")}
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
                error={form1.formState.errors.confirmPassword?.message}
                {...form1.register("confirmPassword")}
                rightIcon={
                  <button type="button" onClick={() => setShowConfirm(v => !v)} className="text-gray-400 hover:text-gray-600">
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />
              <Button type="submit" size="lg" className="mt-2">{t("continue")} <ArrowRight className="h-4 w-4" /></Button>
              <p className="text-center text-xs text-[#9ca3af]">
                {t("terms")}{" "}
                <Link href="/terminos" className="text-[#009FD9] hover:underline">{t("termsLink")}</Link>
              </p>
            </form>
          )}

          {/* Step 2 */}
          {step === 1 && (
            <form onSubmit={form2.handleSubmit(onStep2)} className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">{t("category")}</label>
                <Select onValueChange={(v) => form2.setValue("category", v)}>
                  <SelectTrigger className={form2.formState.errors.category ? "border-red-400" : ""}>
                    <SelectValue placeholder={t("categoryPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.icon} {tCat(cat.id)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form2.formState.errors.category && (
                  <p className="text-xs text-red-500 mt-1">{form2.formState.errors.category.message}</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">{t("province")}</label>
                <Select onValueChange={(v) => { setSelectedProvince(v); form2.setValue("province", v); form2.setValue("canton", ""); }}>
                  <SelectTrigger><SelectValue placeholder={t("provincePlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    {PROVINCES.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">{t("canton")}</label>
                <Select disabled={!selectedProvince} onValueChange={(v) => form2.setValue("canton", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={selectedProvince ? t("cantonPlaceholder") : t("cantonDisabled")} />
                  </SelectTrigger>
                  <SelectContent>
                    {cantons.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">{t("whatsapp")}</label>
                <div className="flex items-center gap-0">
                  <span className="inline-flex items-center h-10 px-3 rounded-l-xl border border-r-0 border-[#e5e7eb] bg-[#f3f4f6] text-sm font-medium text-[#374151] shrink-0">+506</span>
                  <input
                    type="tel"
                    placeholder="8888-8888"
                    value={whatsappValue}
                    onChange={e => handleWhatsappChange(e.target.value)}
                    maxLength={8}
                    className="flex-1 h-10 px-3 rounded-r-xl border border-[#e5e7eb] text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                  />
                </div>
                {whatsappValue.length === 8 && /^[678]/.test(whatsappValue) && (
                  <p className="text-xs text-emerald-600 mt-1">Se mostrará como: {whatsappFormatted}</p>
                )}
                {form2.formState.errors.whatsapp && (
                  <p className="text-xs text-red-500 mt-1">{form2.formState.errors.whatsapp.message}</p>
                )}
              </div>
              <div className="flex gap-3 mt-2">
                <Button variant="outline" size="lg" type="button" onClick={() => setStep(0)}><ArrowLeft className="h-4 w-4" /> {t("back")}</Button>
                <Button type="submit" size="lg" className="flex-1">{t("continue")} <ArrowRight className="h-4 w-4" /></Button>
              </div>
            </form>
          )}

          {/* Step 3 */}
          {step === 2 && (
            <form onSubmit={form3.handleSubmit(onStep3)} className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("bio")} <span className="text-[#9ca3af] font-normal ml-1">({t("bioMin")})</span>
                </label>
                <textarea
                  className={cn(
                    "w-full rounded-xl border bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[120px] resize-none",
                    "border-[#e5e7eb] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all",
                    form3.formState.errors.bio && "border-red-400"
                  )}
                  placeholder={t("bioPlaceholder")}
                  {...form3.register("bio")}
                />
                {form3.formState.errors.bio && (
                  <p className="text-xs text-red-500 mt-1">{form3.formState.errors.bio.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label={t("yearsExp")} type="number" placeholder={t("yearsExpPlaceholder")} {...form3.register("yearsExperience")} />
                <Input label={t("hourlyRate")} type="number" placeholder={t("hourlyRatePlaceholder")} hint={t("optional")} {...form3.register("hourlyRate")} />
              </div>
              <div className="bg-[#f3f4f6] rounded-2xl p-4">
                <p className="text-xs text-[#6b7280] font-medium mb-2">{t("addLater")}</p>
                <div className="flex flex-wrap gap-2">
                  {[t("photos"), t("coverage"), t("availability")].map((item) => (
                    <Badge key={item} variant="muted">{item}</Badge>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 mt-2">
                <Button variant="outline" size="lg" type="button" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> {t("back")}</Button>
                <Button type="submit" size="lg" className="flex-1" loading={submitting}>
                  {submitting ? t("creating") : t("create")}
                </Button>
              </div>
            </form>
          )}

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
