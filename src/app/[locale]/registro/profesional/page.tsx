"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
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
import { OtpVerification } from "@/components/auth/otp-verification";
import { useAuth } from "@/hooks/use-auth";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const step1Schema = z
  .object({
    cedula: z.string().min(9, "Cédula inválida").max(12, "Cédula inválida"),
    email: z.string().email("Email inválido"),
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

// ─── Helper components ────────────────────────────────────────────────────────

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

function validateCedulaFormat(cedula: string): string | null {
  const digits = cedula.replace(/\D/g, "");
  if (/^[1-9]\d{8}$/.test(digits)) return null;
  if (/^\d{11,12}$/.test(digits)) return null;
  if (/^\d{10}$/.test(digits)) return null;
  return "Formato inválido. Cédula CR: 9 dígitos. DIMEX: 11-12 dígitos. NITE: 10 dígitos.";
}

function StepIndicator({
  current,
  labels,
}: {
  current: number;
  labels: string[];
}) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {labels.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all",
              i < current
                ? "bg-[#009FD9] text-white"
                : i === current
                ? "bg-[#009FD9] text-white ring-4 ring-[#009FD9]/20"
                : "bg-[#e5e7eb] text-[#9ca3af]"
            )}
          >
            {i < current ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
          </div>
          <span
            className={cn(
              "text-sm font-medium hidden sm:block",
              i === current ? "text-[#009FD9]" : "text-[#9ca3af]"
            )}
          >
            {label}
          </span>
          {i < labels.length - 1 && (
            <div
              className={cn(
                "h-px w-8 sm:w-12 transition-all",
                i < current ? "bg-[#009FD9]" : "bg-[#e5e7eb]"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RegisterProfessionalPage() {
  const t = useTranslations("registration.pro");
  const tCat = useTranslations("categories");
  const router = useRouter();

  // Auth state: detect if already logged in (OAuth → onboarding flow)
  const { user: currentUser, loading: authLoading } = useAuth();

  // Step: -1 = loading, 0 = identity, 1 = service, 2 = profile
  const [step, setStep] = useState(-1);
  const [fullName, setFullName] = useState("");
  const [manualName, setManualName] = useState(false);
  const [manualNameValue, setManualNameValue] = useState("");
  const [loadingCedula, setLoadingCedula] = useState(false);
  const [cedulaFormatError, setCedulaFormatError] = useState<string | null>(null);
  const [selectedProvince, setSelectedProvince] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [whatsappValue, setWhatsappValue] = useState("");
  const [whatsappFormatted, setWhatsappFormatted] = useState("");
  const [otpEmail, setOtpEmail] = useState<string | null>(null);

  const [step1Data, setStep1Data] = useState<Step1Data | null>(null);
  const [step2Data, setStep2Data] = useState<Step2Data | null>(null);

  const cantons = getCantonsByProvince(selectedProvince);

  const form1 = useForm<Step1Data>({ resolver: zodResolver(step1Schema) });
  const form2 = useForm<Step2Data>({ resolver: zodResolver(step2Schema) });
  const form3 = useForm<Step3Data>({ resolver: zodResolver(step3Schema) });

  const watchedPassword = form1.watch("password") ?? "";

  // Initialize step after auth loads
  useEffect(() => {
    if (!authLoading) {
      if (currentUser) {
        // Already logged in (OAuth onboarding flow) → skip identity
        setStep(1);
        const name = (currentUser.user_metadata?.full_name ??
          currentUser.user_metadata?.name ??
          "") as string;
        if (name) setFullName(name);
      } else {
        setStep(0);
      }
    }
  }, [authLoading, currentUser]);

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

  async function lookupCedula(value: string) {
    const formatErr = validateCedulaFormat(value);
    if (formatErr) {
      setCedulaFormatError(formatErr);
      return;
    }
    setCedulaFormatError(null);
    const cedula = value.replace(/\D/g, "");
    if (cedula.length < 9) return;
    setLoadingCedula(true);
    try {
      const res = await fetch(`/api/cedula/${cedula}`);
      if (res.ok) {
        const data = await res.json();
        setFullName(data.fullName);
        setManualName(false);
      } else if (res.status === 503 || res.status === 404) {
        setManualName(true);
      }
    } catch {
      setManualName(true);
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
    if (!step2Data) return;
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      let userId: string;

      if (currentUser) {
        // ── OAuth / already-logged-in path ─────────────────────────────────
        userId = currentUser.id;
      } else {
        // ── Email/password path ────────────────────────────────────────────
        if (!step1Data) return;
        const resolvedName =
          manualName ? manualNameValue : fullName || step1Data.email.split("@")[0];

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: step1Data.email,
          password: step1Data.password,
          options: {
            data: {
              full_name: resolvedName,
              cedula: step1Data.cedula.replace(/\D/g, ""),
              role: "professional",
            },
          },
        });
        if (signUpError) throw signUpError;
        if (!signUpData.user?.id) throw new Error("No se pudo crear la cuenta.");
        userId = signUpData.user.id;
      }

      // Create professional record (uses service_role, bypasses RLS)
      const resolvedName = currentUser
        ? fullName || (currentUser.user_metadata?.full_name as string) || (currentUser.email?.split("@")[0] ?? "profesional")
        : manualName
        ? manualNameValue
        : fullName || step1Data!.email.split("@")[0];

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

      if (currentUser) {
        // OAuth user: onboarding already marked done by /onboarding page → go to dashboard
        router.push("/dashboard/profesional");
      } else {
        // Email/password user: show OTP screen
        setOtpEmail(step1Data!.email);
      }
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

  // ── OTP screen ──────────────────────────────────────────────────────────────
  if (otpEmail) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center py-12 px-4">
          <div className="w-full max-w-sm">
            <OtpVerification
              email={otpEmail}
              onVerified={() => router.push("/dashboard/profesional")}
            />
          </div>
        </main>
        <LandingFooter />
      </div>
    );
  }

  // ── Auth loading ─────────────────────────────────────────────────────────────
  if (step === -1) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
      </div>
    );
  }

  // Steps for indicator: identity-step only shown to non-logged-in users
  const stepLabels = currentUser
    ? [t("steps.service"), t("steps.profile")]
    : [t("steps.identity"), t("steps.service"), t("steps.profile")];

  // Current indicator index (0-based within the visible steps)
  const indicatorStep = currentUser ? step - 1 : step;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-10 px-4">
        <div className="mx-auto max-w-lg">
          <div className="text-center mb-2">
            <h1 className="text-2xl font-bold text-[#111827]">
              {currentUser ? "Completá tu perfil profesional" : t("title")}
            </h1>
            <p className="text-[#6b7280] text-sm mt-1">
              {currentUser
                ? "Contanos sobre tu servicio para que los clientes te encuentren."
                : t("subtitle")}
            </p>
          </div>
          <StepIndicator current={indicatorStep} labels={stepLabels} />

          {error && (
            <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-4">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* ── Step 0: Identity (email/password users only) ── */}
          {step === 0 && !currentUser && (
            <form onSubmit={form1.handleSubmit(onStep1)} className="flex flex-col gap-4">
              <div className="bg-[#EBF5FB] rounded-2xl p-4 border border-[#bfdbfe]">
                <div className="flex items-start gap-2">
                  <Shield className="h-4 w-4 text-[#009FD9] shrink-0 mt-0.5" />
                  <p className="text-sm text-[#0089bb] font-medium">{t("verifyNote")}</p>
                </div>
              </div>
              <div>
                <Input
                  label={t("cedula")}
                  placeholder={t("cedulaPlaceholder")}
                  hint={t("cedulaHint")}
                  error={cedulaFormatError ?? form1.formState.errors.cedula?.message}
                  {...form1.register("cedula")}
                  onBlur={(e) => lookupCedula(e.target.value)}
                  rightIcon={
                    loadingCedula ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined
                  }
                />
              </div>

              {fullName && !manualName && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[#EBF5FB] border border-[#bfdbfe]">
                  <Shield className="h-5 w-5 text-[#009FD9] shrink-0" />
                  <div>
                    <p className="text-xs text-[#6b7280]">{t("verifiedName")}</p>
                    <p className="text-sm font-semibold text-[#111827]">{fullName}</p>
                  </div>
                </div>
              )}

              {manualName && (
                <div>
                  <label className="text-sm font-medium text-[#374151] block mb-1.5">
                    Tu nombre completo
                  </label>
                  <input
                    type="text"
                    placeholder="Juan Carlos Pérez González"
                    value={manualNameValue}
                    onChange={(e) => setManualNameValue(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-[#e5e7eb] text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                  />
                  <p className="text-xs text-[#9ca3af] mt-1">Ingresá tu nombre manualmente</p>
                </div>
              )}

              <Input
                label={t("email")}
                type="email"
                placeholder={t("emailPlaceholder")}
                error={form1.formState.errors.email?.message}
                {...form1.register("email")}
              />
              <div>
                <Input
                  label={t("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder={t("passwordPlaceholder")}
                  error={form1.formState.errors.password?.message}
                  {...form1.register("password")}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-gray-400 hover:text-gray-600"
                    >
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
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />
              <Button type="submit" size="lg" className="mt-2">
                {t("continue")} <ArrowRight className="h-4 w-4" />
              </Button>
              <p className="text-center text-xs text-[#9ca3af]">
                {t("terms")}{" "}
                <Link href="/terminos" className="text-[#009FD9] hover:underline">
                  {t("termsLink")}
                </Link>
              </p>
            </form>
          )}

          {/* ── Step 1: Service info ── */}
          {step === 1 && (
            <form onSubmit={form2.handleSubmit(onStep2)} className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("category")}
                </label>
                <Select onValueChange={(v) => form2.setValue("category", v)}>
                  <SelectTrigger
                    className={form2.formState.errors.category ? "border-red-400" : ""}
                  >
                    <SelectValue placeholder={t("categoryPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.icon} {tCat(cat.id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form2.formState.errors.category && (
                  <p className="text-xs text-red-500 mt-1">
                    {form2.formState.errors.category.message}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("province")}
                </label>
                <Select
                  onValueChange={(v) => {
                    setSelectedProvince(v);
                    form2.setValue("province", v);
                    form2.setValue("canton", "");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("provincePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVINCES.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("canton")}
                </label>
                <Select
                  disabled={!selectedProvince}
                  onValueChange={(v) => form2.setValue("canton", v)}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        selectedProvince ? t("cantonPlaceholder") : t("cantonDisabled")
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {cantons.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("whatsapp")}
                </label>
                <div className="flex items-center gap-0">
                  <span className="inline-flex items-center h-10 px-3 rounded-l-xl border border-r-0 border-[#e5e7eb] bg-[#f3f4f6] text-sm font-medium text-[#374151] shrink-0">
                    +506
                  </span>
                  <input
                    type="tel"
                    placeholder="8888-8888"
                    value={whatsappValue}
                    onChange={(e) => handleWhatsappChange(e.target.value)}
                    maxLength={8}
                    className="flex-1 h-10 px-3 rounded-r-xl border border-[#e5e7eb] text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                  />
                </div>
                {whatsappValue.length === 8 && /^[678]/.test(whatsappValue) && (
                  <p className="text-xs text-emerald-600 mt-1">
                    Se mostrará como: {whatsappFormatted}
                  </p>
                )}
                {form2.formState.errors.whatsapp && (
                  <p className="text-xs text-red-500 mt-1">
                    {form2.formState.errors.whatsapp.message}
                  </p>
                )}
              </div>
              <div className="flex gap-3 mt-2">
                {!currentUser && (
                  <Button
                    variant="outline"
                    size="lg"
                    type="button"
                    onClick={() => setStep(0)}
                  >
                    <ArrowLeft className="h-4 w-4" /> {t("back")}
                  </Button>
                )}
                <Button type="submit" size="lg" className="flex-1">
                  {t("continue")} <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          )}

          {/* ── Step 2: Profile ── */}
          {step === 2 && (
            <form onSubmit={form3.handleSubmit(onStep3)} className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("bio")}{" "}
                  <span className="text-[#9ca3af] font-normal ml-1">({t("bioMin")})</span>
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
                  <p className="text-xs text-red-500 mt-1">
                    {form3.formState.errors.bio.message}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={t("yearsExp")}
                  type="number"
                  placeholder={t("yearsExpPlaceholder")}
                  {...form3.register("yearsExperience")}
                />
                <Input
                  label={t("hourlyRate")}
                  type="number"
                  placeholder={t("hourlyRatePlaceholder")}
                  hint={t("optional")}
                  {...form3.register("hourlyRate")}
                />
              </div>
              <div className="bg-[#f3f4f6] rounded-2xl p-4">
                <p className="text-xs text-[#6b7280] font-medium mb-2">{t("addLater")}</p>
                <div className="flex flex-wrap gap-2">
                  {[t("photos"), t("coverage"), t("availability")].map((item) => (
                    <Badge key={item} variant="muted">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 mt-2">
                <Button
                  variant="outline"
                  size="lg"
                  type="button"
                  onClick={() => setStep(1)}
                >
                  <ArrowLeft className="h-4 w-4" /> {t("back")}
                </Button>
                <Button type="submit" size="lg" className="flex-1" loading={submitting}>
                  {submitting ? t("creating") : t("create")}
                </Button>
              </div>
            </form>
          )}

          {!currentUser && (
            <p className="text-center text-sm text-[#6b7280] mt-6">
              {t("alreadyHaveAccount")}{" "}
              <Link href="/login" className="text-[#009FD9] font-medium hover:underline">
                {t("signIn")}
              </Link>
            </p>
          )}
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
