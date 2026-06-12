"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  CheckCircle2, ArrowRight, ArrowLeft, Loader2, AlertCircle,
  Eye, EyeOff, Circle, Camera, MapPin, Truck, X, Plus,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navbar } from "@/components/layout/navbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PhoneInput, isPhoneComplete } from "@/components/ui/phone-input";
import { IdentityField } from "@/components/ui/identity-field";
import { LandingFooter } from "@/components/landing/landing-footer";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { OtpVerification } from "@/components/auth/otp-verification";
import { useAuth } from "@/hooks/use-auth";
import { CategorySearch } from "@/components/ui/category-search";
import { getCategoryLabel } from "@/lib/data/categories";
import { WorkplacesPicker, type Workplace } from "@/components/maps/workplaces-picker";
import { CoverageAreaSelector } from "@/components/maps/coverage-area-selector";
import { computeSearchAreas, primaryArea, type CoverageArea } from "@/lib/location";
import { useAvailabilityCheck } from "@/hooks/use-availability-check";

// ─── Category data lives in src/lib/data/categories.ts (single source of truth) ─
// The CategorySearch component handles display + fuzzy search; this page never
// re-declares the taxonomy. (A large hardcoded duplicate list — ~80 untranslated
// labels diverging from the real taxonomy, unused and kept alive only by a
// `_unused` ref — was removed here.)

// ─── Schemas ──────────────────────────────────────────────────────────────────

function validateCedulaFormat(v: string): boolean {
  const d = v.replace(/\D/g, "");
  return /^[1-9]\d{8}$/.test(d) || /^\d{11,12}$/.test(d) || /^\d{10}$/.test(d);
}

// Schemas are built INSIDE the component (useMemo) so their messages localize —
// see `makeSchemas` near the top of RegisterProfessionalPage.
type Step1Data = { fullName: string; cedula: string; email: string; password: string; confirmPassword: string };
type Step2Data = { category: string; whatsapp: string; address?: string };
type Step3Data = { yearsExperience?: string; hourlyRate?: string };

// ─── Helper components ────────────────────────────────────────────────────────

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

function StepIndicator({ current, labels }: { current: number; labels: string[] }) {
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
              className={cn("h-px w-8 sm:w-12 transition-all", i < current ? "bg-[#009FD9]" : "bg-[#e5e7eb]")}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Photo picker ─────────────────────────────────────────────────────────────

function PhotoPicker({
  preview,
  onFile,
  onRemove,
}: {
  preview: string | null;
  onFile: (f: File) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("registration.pro");
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-center gap-3 mb-4">
      {preview ? (
        <img
          src={preview}
          alt={t("photoAlt")}
          className="h-24 w-24 rounded-full object-cover border-2 border-[#e5e7eb]"
        />
      ) : (
        <div className="h-24 w-24 rounded-full bg-[#EBF5FB] border-2 border-dashed border-[#bfdbfe] flex items-center justify-center">
          <Camera className="h-8 w-8 text-[#009FD9]" />
        </div>
      )}

      {preview ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()}>
            <Camera className="h-4 w-4" /> {t("photoChange")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onRemove} className="border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600">
            <X className="h-4 w-4" /> {t("photoRemove")}
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()}>
          <Camera className="h-4 w-4" /> {t("photoAdd")}
        </Button>
      )}

      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </div>
  );
}

// ─── "No tengo identificación costarricense" (foreigners) ─────────────────────
// Routes the account to the admin EXCEPTIONS queue ("pendiente de revisión") where
// the admin reviews whatever document they have (passport, DIMEX in progress).
// Exception path is progressive-disclosure: a subtle text link directly below the
// identity block reveals the foreigner fields (and offers a way back), so the main
// cédula → nombre flow reads clean and uninterrupted.
function NoCrIdDisclosure({ active, onToggle }: { active: boolean; onToggle: (v: boolean) => void }) {
  const t = useTranslations("registration.pro");
  return (
    <button
      type="button"
      onClick={() => onToggle(!active)}
      className="self-start text-sm text-[#009FD9] hover:underline"
    >
      {active ? t("hasCrIdLink") : t("noCrIdLink")}
    </button>
  );
}

function NoCrIdFields({
  fullName, onFullName, note, onNote, nameError,
}: {
  fullName: string; onFullName: (v: string) => void; note: string; onNote: (v: string) => void; nameError?: string;
}) {
  const t = useTranslations("registration.pro");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3 text-xs text-[#92400e]">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          {t.rich("noCrIdNotice", { b: (c) => <strong>{c}</strong> })}
        </span>
      </div>
      <Input
        label={<>{t("manualName")} <span className="text-red-500">*</span></>}
        placeholder={t("manualNameHint")}
        value={fullName}
        onChange={(e) => onFullName(e.target.value)}
        error={nameError}
      />
      <div>
        <label className="text-sm font-medium text-[#374151] block mb-1.5">
          {t("yourDocument")} <span className="text-[#9ca3af] font-normal">{t("optionalParen")}</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => onNote(e.target.value)}
          rows={2}
          placeholder={t("idDocNotePlaceholder")}
          className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
        />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RegisterProfessionalPage() {
  const t = useTranslations("registration.pro");
  const tRp = useTranslations("resetPassword");
  const locale = useLocale();
  const router = useRouter();

  // Schemas built here so the validation messages localize. Password rules +
  // "passwords don't match" reuse the shared resetPassword labels.
  const { step1Schema, step2Schema, step3Schema } = useMemo(() => ({
    step1Schema: z
      .object({
        fullName: z.string().min(3, t("valNameRequired")),
        cedula: z.string(),
        email: z.string().min(1, t("valEmailRequired")).email(t("valEmailInvalid")),
        password: z
          .string()
          .min(8, tRp("rule8"))
          .regex(/[A-Z]/, tRp("ruleUpper"))
          .regex(/[a-z]/, tRp("ruleLower"))
          .regex(/[0-9]/, tRp("ruleNumber"))
          .regex(/[!@#$%^&*]/, tRp("ruleSpecial")),
        confirmPassword: z.string(),
      })
      .refine((d) => d.password === d.confirmPassword, {
        message: tRp("passwordsDontMatch"),
        path: ["confirmPassword"],
      }),
    step2Schema: z.object({
      category: z.string().min(1, t("valCategoryRequired")),
      whatsapp: z.string().min(8, t("valWhatsappRequired")).max(15, t("valWhatsappInvalid")),
      address: z.string().optional(),
    }),
    step3Schema: z.object({
      yearsExperience: z.string().optional(),
      hourlyRate: z.string().optional(),
    }),
  }), [t, tRp]);
  const { user: currentUser, loading: authLoading } = useAuth();

  // step: -1=loading, 0=identity (email/pw users), 1=service+location, 2=profile+photo
  const [step, setStep] = useState(-1);
  const [serviceMobile, setServiceMobile] = useState(false);
  const [serviceFixed, setServiceFixed] = useState(false);
  const [serviceTypeError, setServiceTypeError] = useState<string | null>(null);
  const [whatsappValue, setWhatsappValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // After a successful create we navigate to the panel. Render a full-screen
  // loader meanwhile so the form/step never flashes back (item 6).
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [coverageAreas, setCoverageAreas] = useState<CoverageArea[]>([]);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);

  const [step1Data, setStep1Data] = useState<Step1Data | null>(null);
  const [step2Data, setStep2Data] = useState<Step2Data | null>(null);
  // OAuth (quick-login) professionals never pass through the email/password
  // identity step, so we collect their (required) cédula in the service step.
  const [oauthCedula, setOauthCedula] = useState("");
  const [oauthCedulaError, setOauthCedulaError] = useState<string | null>(null);
  // "No tengo identificación costarricense" → manual review (admin exceptions).
  const [noCrId, setNoCrId] = useState(false);
  // "¿No es tu información?" — the padrón matched but the user says it's not theirs.
  // Routed to the SAME manual-review path as no_cr_id (never auto-verified).
  const [identityMismatch, setIdentityMismatch] = useState(false);
  const [idDocNote, setIdDocNote] = useState("");
  const [oauthFullName, setOauthFullName] = useState("");
  const [oauthNameError, setOauthNameError] = useState<string | null>(null);
  // A converting client may already have a verified cédula on file — never re-ask
  // for it (re-entering would error as "already registered"). null = still loading.
  const [accountCedula, setAccountCedula] = useState<string | null>("");
  // Additional categories (multi-category support). Primary = step2 `category`.
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [extraCatInput, setExtraCatInput] = useState("");
  // The "add another profession" search is revealed on demand (a clear action),
  // not shown as a second always-visible dropdown that confused people.
  const [showExtraProf, setShowExtraProf] = useState(false);
  // Optional brand/business name is now collected in the panel (not registration);
  // kept empty here so the create payload still sends a (null) value cleanly.
  const businessName = "";

  const form1 = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    mode: "onBlur",
    defaultValues: { fullName: "", cedula: "", email: "", password: "", confirmPassword: "" },
  });
  const form2 = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
    mode: "onBlur",
    defaultValues: { category: "", whatsapp: "", address: "" },
  });
  const form3 = useForm<Step3Data>({
    resolver: zodResolver(step3Schema),
    mode: "onBlur",
    defaultValues: { yearsExperience: "", hourlyRate: "" },
  });

  // On a failed submit, jump to the first field with an error.
  function scrollToFirstError() {
    setTimeout(() => {
      const el = document.querySelector('[aria-invalid="true"]') as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus?.();
      }
    }, 50);
  }

  const watchedPassword = form1.watch("password") ?? "";
  const watchedEmail = form1.watch("email") ?? "";
  const watchedCedula = form1.watch("cedula") ?? "";

  // Real-time duplicate detection (email/password identity step)
  const emailCheck = useAvailabilityCheck(watchedEmail, "email", !currentUser);
  const cedulaCheck = useAvailabilityCheck(watchedCedula, "cedula", !currentUser);
  // Real-time cédula check for OAuth professionals
  const oauthCedulaCheck = useAvailabilityCheck(oauthCedula, "cedula", !!currentUser);

  useEffect(() => {
    if (!authLoading) {
      setStep(currentUser ? 1 : 0);
      // Pre-fill photo preview + legal name from OAuth provider if available
      if (currentUser) {
        if (!photoPreview) {
          const oauthPhoto =
            (currentUser.user_metadata?.avatar_url as string) ||
            (currentUser.user_metadata?.picture as string) ||
            null;
          if (oauthPhoto) setPhotoPreview(oauthPhoto);
        }
        setOauthFullName((prev) =>
          prev ||
          (currentUser.user_metadata?.full_name as string) ||
          (currentUser.user_metadata?.name as string) ||
          ""
        );
        // Reuse a cédula already on the account (e.g. a client converting to pro).
        (async () => {
          const supabase = createClient();
          // Own cédula/name via the SECURITY DEFINER RPC (sensitive columns are
          // no longer directly selectable — see migration 047).
          const { data: prof } = await supabase.rpc("get_my_profile");
          const existing = (prof?.cedula as string) || (currentUser.user_metadata?.cedula as string) || "";
          setAccountCedula(existing);
          if (existing) setOauthCedula(existing);
          if (prof?.full_name) setOauthFullName((prev) => prev || (prof.full_name as string));
        })();
      } else {
        setAccountCedula("");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, currentUser]);

  // Registro guard — a user who is ALREADY a professional must never land on the
  // registration/convert flow; bounce them to their professional panel. A client
  // converting to professional has NO `professionals` row yet, so they stay and
  // continue the flow (this is the "Ofrecer mis servicios" path).
  useEffect(() => {
    if (authLoading || !currentUser) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("professionals")
        .select("id")
        .eq("profile_id", currentUser.id)
        .maybeSingle();
      if (!cancelled && data) {
        setRedirecting(true);
        router.replace("/dashboard/profesional");
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, currentUser, router]);

  function handlePhotoSelect(file: File) {
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  }

  // ── Cédula API lookup — commented out, activate when credentials arrive ──
  // async function lookupCedula(cedula: string) {
  //   if (!validateCedulaFormat(cedula)) return;
  //   const res = await fetch(`/api/cedula/${cedula.replace(/\D/g, "")}`);
  //   if (res.ok) {
  //     const { fullName } = await res.json();
  //     form1.setValue("firstName", fullName.split(" ")[0] ?? "");
  //     form1.setValue("firstLastName", fullName.split(" ")[1] ?? "");
  //     form1.setValue("secondLastName", fullName.split(" ").slice(2).join(" ") ?? "");
  //   }
  // }

  function onStep1(data: Step1Data) {
    if (emailCheck.taken) {
      form1.setError("email", { message: t("errEmailTaken") });
      return;
    }
    // Cédula format required UNLESS the pro has no CR identification OR flagged the
    // padrón match as "not mine" (both → manual review; the cédula isn't stored).
    if (!noCrId && !identityMismatch && !validateCedulaFormat(data.cedula ?? "")) {
      form1.setError("cedula", { message: t("errIdFormat") });
      return;
    }
    if (!noCrId && !identityMismatch && cedulaCheck.taken) {
      form1.setError("cedula", { message: t("errIdTaken") });
      return;
    }
    // Manual-review cases still need a typed name.
    if ((noCrId || identityMismatch) && (data.fullName ?? "").trim().length < 3) {
      form1.setError("fullName", { message: t("errNameRequired") });
      return;
    }
    setStep1Data(data);
    setStep(1);
  }

  function onStep2(data: Step2Data) {
    // The WhatsApp number must match the exact digit length of its country.
    if (!isPhoneComplete(data.whatsapp)) {
      form2.setError("whatsapp", { message: t("errPhoneIncomplete") });
      return;
    }
    if (!serviceMobile && !serviceFixed) {
      setServiceTypeError(t("errServiceType"));
      return;
    }
    // Location must come from at least one pin (fixed) or coverage area (mobile).
    if (serviceFixed && workplaces.length === 0) {
      setLocationError(t("errWorkplace"));
      return;
    }
    if (serviceMobile && coverageAreas.length === 0) {
      setLocationError(t("errCoverage"));
      return;
    }
    setLocationError(null);
    // OAuth professionals must provide a cédula UNLESS they have no CR ID (→ review)
    // or already have one on file (converting client — reuse it, never re-ask).
    if (currentUser && !noCrId && !identityMismatch && !accountCedula && !validateCedulaFormat(oauthCedula)) {
      setOauthCedulaError(t("errIdRequired"));
      return;
    }
    if (currentUser && !noCrId && !identityMismatch && !accountCedula && oauthCedulaCheck.taken) {
      setOauthCedulaError(t("errIdTaken"));
      return;
    }
    if (currentUser && oauthFullName.trim().length < 3) {
      setOauthNameError(t("errNameRequired"));
      return;
    }
    setOauthNameError(null);
    setOauthCedulaError(null);
    setServiceTypeError(null);
    setStep2Data(data);
    setStep(2);
  }

  async function onStep3(data: Step3Data) {
    if (!step2Data) return;
    setSubmitting(true);
    setError(null);

    try {
      // ── 1. Upload photo if provided ────────────────────────────────────────
      let photoUrl: string | undefined;
      if (photoFile) {
        setUploadingPhoto(true);
        const fd = new FormData();
        fd.append("file", photoFile);
        fd.append("type", "avatar");
        const uploadRes = await fetch("/api/upload/photo", { method: "POST", body: fd });
        setUploadingPhoto(false);
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          photoUrl = url;
        }
      }

      const supabase = createClient();
      let userId: string;
      let userEmail: string;

      if (currentUser) {
        // ── 2a. OAuth / already-logged-in path ────────────────────────────────
        userId = currentUser.id;
        userEmail = currentUser.email ?? "";
      } else {
        // ── 2b. Email/password path ───────────────────────────────────────────
        if (!step1Data) return;
        const fullName = step1Data.fullName.trim();

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: step1Data.email,
          password: step1Data.password,
          options: {
            data: {
              full_name: fullName,
              // Manual-review cases (no CR ID / "not my info") do NOT store the cédula
              // — so it is never auto-verified against the padrón.
              cedula: (noCrId || identityMismatch) ? null : step1Data.cedula.replace(/\D/g, ""),
              role: "professional",
              onboarding_completed: true,
            },
          },
        });
        if (signUpError) throw signUpError;
        if (!signUpData.user?.id) throw new Error(t("errCreateAccount"));
        // Supabase anti-enumeration: an already-registered email returns a user
        // object with an EMPTY identities array (no error). Detect it explicitly.
        if (Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0) {
          throw new Error(t("errAccountExists"));
        }
        userId = signUpData.user.id;
        userEmail = step1Data.email;
      }

      // ── 3. Build names for the profile upsert ─────────────────────────────
      const fullName = currentUser
        ? (oauthFullName.trim() ||
          (currentUser.user_metadata?.full_name as string) ||
          (currentUser.user_metadata?.name as string) ||
          (currentUser.email?.split("@")[0] ?? "profesional"))
        : step1Data!.fullName.trim();

      const serviceType = [
        serviceMobile ? "mobile" : null,
        serviceFixed ? "fixed" : null,
      ]
        .filter(Boolean)
        .join(",");

      // Location is derived from pins (fixed) + coverage areas (mobile).
      const effWorkplaces = serviceFixed ? workplaces : [];
      const effCoverage = serviceMobile ? coverageAreas : [];
      const { provincias, cantones, coverageProvincias, coverageCountry } = computeSearchAreas(effWorkplaces, effCoverage);
      const primary = primaryArea(effWorkplaces, effCoverage);

      // ── 4. Create/upsert profile + professional record ─────────────────────
      const proRes = await fetch("/api/register/professional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          email: userEmail,
          fullName,
          businessName: businessName.trim() || null,
          cedula: (noCrId || identityMismatch) ? null : (step1Data?.cedula?.replace(/\D/g, "") ?? (oauthCedula ? oauthCedula.replace(/\D/g, "") : null)),
          // "not my info" reuses the no-CR-ID manual-review path (pending, no auto-verify).
          noCrId: noCrId || identityMismatch,
          idDocNote: ((identityMismatch ? "El usuario indicó que la información del padrón no es suya. " : "") + idDocNote.trim()).trim() || null,
          photoUrl,
          category: step2Data.category,
          professions: [step2Data.category, ...extraCategories],
          serviceType,
          province: primary.provinciaId ?? null,
          canton: primary.cantonId ?? null,
          // Pins + coverage areas + denormalized search arrays (location-aware /buscar).
          workplaces: effWorkplaces,
          coverageAreas: effCoverage,
          searchProvincias: provincias,
          searchCantones: cantones,
          coverageProvincias,
          coverageCountry,
          address: workplaces[0]?.address || step2Data.address || null,
          lat: workplaces[0]?.lat ?? null,
          lng: workplaces[0]?.lng ?? null,
          whatsapp: step2Data.whatsapp,
          yearsExperience: data.yearsExperience,
          hourlyRate: data.hourlyRate,
        }),
      });

      if (!proRes.ok) {
        const { error: proErr } = await proRes.json();
        throw new Error(proErr ?? t("errCreateProfile"));
      }

      if (currentUser) {
        // Persist the professional role in auth metadata too, so navigating away
        // and back never reverts to the role-selection screen (and a converted
        // client stays professional across sessions).
        try {
          await supabase.auth.updateUser({ data: { role: "professional", onboarding_completed: true } });
        } catch { /* best-effort */ }
        // Show the full-screen loader BEFORE navigating so the photo step never
        // flashes back. Hard navigation so the refreshed session (new role) is read.
        setRedirecting(true);
        window.location.href = `/${locale}/dashboard/profesional`;
        return;
      } else {
        setOtpEmail(step1Data!.email);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("errTitle");
      if (
        msg.includes("already registered") ||
        msg.includes("already been registered") ||
        msg.includes("already exists") ||
        msg.includes("ya está registrado") ||
        msg.includes("Ya existe una cuenta")
      ) {
        setError(t("errAccountExists"));
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
      setUploadingPhoto(false);
    }
  }

  // ── OTP screen ──────────────────────────────────────────────────────────────
  if (otpEmail) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center py-12 px-4">
          <div className="w-full max-w-sm">
            <OtpVerification email={otpEmail} />
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

  // ── Post-create redirect — clean loader, never flash the form/step back ──────
  if (redirecting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
        <p className="text-sm text-[#6b7280]">{t("creatingAccount")}</p>
      </div>
    );
  }

  const stepLabels = currentUser
    ? [t("steps.service"), t("steps.profile")]
    : [t("steps.identity"), t("steps.service"), t("steps.profile")];
  const indicatorStep = currentUser ? step - 1 : step;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-10 px-4">
        <div className="mx-auto max-w-lg">
          <div className="text-center mb-2">
            <h1 className="text-2xl font-bold text-[#111827]">
              {currentUser ? t("completeProfileTitle") : t("title")}
            </h1>
            <p className="text-[#6b7280] text-sm mt-1">
              {currentUser ? t("completeProfileSubtitle") : t("subtitle")}
            </p>
          </div>
          <StepIndicator current={indicatorStep} labels={stepLabels} />

          {error && (
            <div className="flex flex-col gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
              {error === t("errAccountExists") && (
                <Link
                  href="/login"
                  className="self-start ml-7 text-sm font-semibold text-[#009FD9] hover:underline"
                >
                  {t("goToLogin")}
                </Link>
              )}
            </div>
          )}

          {/* ── OAuth identity confirmation ───────────────────────────────── */}
          {currentUser && (
            <div className="flex items-center gap-3 bg-[#EBF5FB] border border-[#bfdbfe] rounded-xl px-4 py-3 mb-4">
              {photoPreview && (
                <img src={photoPreview} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#009FD9] font-semibold">{t("oauthConfirmed")}</p>
                <p className="text-sm font-bold text-[#111827] truncate">
                  {(currentUser.user_metadata?.full_name as string) ||
                   (currentUser.user_metadata?.name as string) ||
                   currentUser.email}
                </p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-[#009FD9] shrink-0" />
            </div>
          )}

          {/* ── Step 0: Identity (email/password users only) ─────────────── */}
          {/* Social sign-up lives on the LOGIN page only; from there the user
              proceeds into registration. Registration is email/password here. */}
          {step === 0 && !currentUser && (
            <div className="flex flex-col gap-4">
            <form noValidate onSubmit={form1.handleSubmit(onStep1, scrollToFirstError)} className="flex flex-col gap-4">
              {!noCrId ? (
                <>
                  {/* Identity: cédula → padrón lookup → confirm official name. */}
                  <IdentityField
                    cedula={form1.watch("cedula") ?? ""}
                    fullName={form1.watch("fullName") ?? ""}
                    onCedulaChange={(c) => form1.setValue("cedula", c, { shouldValidate: true })}
                    onFullNameChange={(n) => form1.setValue("fullName", n, { shouldValidate: true })}
                    onResult={(r) => { if (r.found) setIdentityMismatch(false); }}
                    onMismatch={() => setIdentityMismatch(true)}
                    cedulaError={form1.formState.errors.cedula?.message ?? (!identityMismatch && cedulaCheck.taken ? t("errIdentificationTaken") : undefined)}
                    nameError={form1.formState.errors.fullName?.message}
                  />
                </>
              ) : (
                <NoCrIdFields
                  fullName={form1.watch("fullName") ?? ""}
                  onFullName={(n) => form1.setValue("fullName", n, { shouldValidate: true })}
                  note={idDocNote}
                  onNote={setIdDocNote}
                  nameError={form1.formState.errors.fullName?.message}
                />
              )}

              {/* Exception path — subtle disclosure link below the identity block. */}
              <NoCrIdDisclosure active={noCrId} onToggle={setNoCrId} />

              <div className="border-t border-[#f3f4f6] pt-4">
                <Input
                  label={<>{t("email")} <span className="text-red-500">*</span></>}
                  type="email"
                  placeholder={t("emailPlaceholder")}
                  error={form1.formState.errors.email?.message ?? (emailCheck.taken ? t("errEmailTaken") : undefined)}
                  {...form1.register("email")}
                />
              </div>

              <div>
                <Input
                  label={<>{t("password")} <span className="text-red-500">*</span></>}
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
                label={<>{t("confirmPassword")} <span className="text-red-500">*</span></>}
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
                {t.rich("termsAgree", {
                  terms: (c) => <Link href="/terminos" className="text-[#009FD9] hover:underline">{c}</Link>,
                  privacy: (c) => <Link href="/privacidad" className="text-[#009FD9] hover:underline">{c}</Link>,
                })}
              </p>
            </form>
            </div>
          )}

          {/* ── Step 1: Service + Location ───────────────────────────────── */}
          {step === 1 && (
            <form noValidate onSubmit={form2.handleSubmit(onStep2, scrollToFirstError)} className="flex flex-col gap-4">

              {/* Identity — required for OAuth professionals (no identity step).
                  A converting client who already has a cédula on file skips this
                  entirely (we reuse the stored, already-verified cédula). */}
              {currentUser && !noCrId && accountCedula ? (
                <div className="flex items-center gap-3 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl px-4 py-3">
                  <CheckCircle2 className="h-5 w-5 text-[#16a34a] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#15803d]">{t("identityAlreadyRegistered")}</p>
                    <p className="text-sm text-[#111827] truncate">{t("usesAccountId", { name: oauthFullName || t("yourAccount") })}</p>
                  </div>
                </div>
              ) : currentUser && !noCrId ? (
                <IdentityField
                  cedula={oauthCedula}
                  fullName={oauthFullName}
                  onCedulaChange={(c) => { setOauthCedula(c); setOauthCedulaError(null); }}
                  onFullNameChange={(n) => { setOauthFullName(n); setOauthNameError(null); }}
                  onResult={(r) => { if (r.found) setIdentityMismatch(false); }}
                  onMismatch={() => setIdentityMismatch(true)}
                  cedulaError={oauthCedulaError ?? (!identityMismatch && oauthCedulaCheck.taken ? t("errIdentificationTaken") : undefined)}
                  nameError={oauthNameError ?? undefined}
                />
              ) : null}
              {currentUser && noCrId && (
                <NoCrIdFields
                  fullName={oauthFullName}
                  onFullName={(n) => { setOauthFullName(n); setOauthNameError(null); }}
                  note={idDocNote}
                  onNote={setIdDocNote}
                  nameError={oauthNameError ?? undefined}
                />
              )}
              {/* Exception path — subtle disclosure link below the identity block.
                  Hidden when the account already carries a verified cédula. */}
              {currentUser && !accountCedula && (
                <NoCrIdDisclosure active={noCrId} onToggle={setNoCrId} />
              )}

              {/* Profession — searchable combobox (a profesión groups the servicios
                  the pro later adds in their panel). Multi-profession: the primary
                  profession + an on-demand "Agregar profesión" action.
                  (Optional brand/business name moved to the panel — registration
                  keeps only the essentials.) */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("professionPrincipal")} <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-[#9ca3af] mb-1.5">{t("professionHelp")}</p>
                <CategorySearch
                  value={form2.watch("category") ?? ""}
                  onChange={(v) => form2.setValue("category", v, { shouldValidate: true })}
                  placeholder={t("searchProfession")}
                  error={form2.formState.errors.category?.message}
                />

                {/* Additional professions — chips + a clear on-demand action */}
                {extraCategories.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {extraCategories.map((c) => (
                      <span key={c} className="inline-flex items-center gap-1.5 rounded-lg bg-[#EBF5FB] text-[#0089bb] text-sm font-medium pl-3 pr-1.5 py-1.5">
                        {getCategoryLabel(c, locale)}
                        <button type="button" onClick={() => setExtraCategories((prev) => prev.filter((x) => x !== c))} className="rounded-md p-0.5 hover:bg-[#009FD9]/20 transition-colors" aria-label={t("remove")}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {showExtraProf ? (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <CategorySearch
                      value={extraCatInput}
                      onChange={(v) => {
                        const primary = form2.watch("category");
                        if (v && v !== primary && !extraCategories.includes(v)) {
                          setExtraCategories((prev) => [...prev, v]);
                        }
                        setExtraCatInput("");
                        setShowExtraProf(false);
                      }}
                      placeholder={t("searchAnotherProfession")}
                    />
                    <button type="button" onClick={() => { setShowExtraProf(false); setExtraCatInput(""); }} className="self-start text-xs text-[#9ca3af] hover:text-[#374151]">
                      {t("cancel")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowExtraProf(true)}
                    className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#009FD9] hover:underline"
                  >
                    <Plus className="h-4 w-4" />
                    {extraCategories.length > 0 ? t("addAnotherProfession") : t("addProfessionPrompt")}
                  </button>
                )}
              </div>

              {/* How you offer services + WHERE — grouped together so the choice and
                  its location stay visually connected (no "where do I go now?"). */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-2">
                  {t("howOffer")} <span className="text-red-500">*</span> <span className="text-[#9ca3af] font-normal">{t("chooseBoth")}</span>
                </label>
                <div className="flex flex-col gap-2">
                  <label className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all",
                    serviceMobile ? "border-[#009FD9] bg-[#EBF5FB]" : "border-[#e5e7eb] hover:border-[#009FD9]/40"
                  )}>
                    <input
                      type="checkbox"
                      checked={serviceMobile}
                      onChange={(e) => {
                        setServiceMobile(e.target.checked);
                        setServiceTypeError(null);
                      }}
                      className="sr-only"
                    />
                    <div className={cn(
                      "h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                      serviceMobile ? "bg-[#009FD9] border-[#009FD9]" : "border-[#d1d5db]"
                    )}>
                      {serviceMobile && (
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <Truck className="h-4 w-4 text-[#009FD9] shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-[#111827]">{t("mobileMode")}</p>
                      <p className="text-xs text-[#9ca3af]">{t("mobileModeSub")}</p>
                    </div>
                  </label>

                  <label className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all",
                    serviceFixed ? "border-[#009FD9] bg-[#EBF5FB]" : "border-[#e5e7eb] hover:border-[#009FD9]/40"
                  )}>
                    <input
                      type="checkbox"
                      checked={serviceFixed}
                      onChange={(e) => {
                        setServiceFixed(e.target.checked);
                        setServiceTypeError(null);
                      }}
                      className="sr-only"
                    />
                    <div className={cn(
                      "h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                      serviceFixed ? "bg-[#009FD9] border-[#009FD9]" : "border-[#d1d5db]"
                    )}>
                      {serviceFixed && (
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <MapPin className="h-4 w-4 text-[#009FD9] shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-[#111827]">{t("fixedMode")}</p>
                      <p className="text-xs text-[#9ca3af]">{t("fixedModeSub")}</p>
                    </div>
                  </label>
                </div>
                {serviceTypeError && (
                  <p className="text-xs text-red-500 mt-1">{serviceTypeError}</p>
                )}

                {/* The matching location block(s) appear right under the choice, in a
                    soft grouped panel (no extra hard borders). */}
                {(serviceFixed || serviceMobile) && (
                  <div className="mt-3 rounded-xl bg-[#f9fafb] p-3.5 flex flex-col gap-4">
                    {serviceFixed && (
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold text-[#111827] flex items-center gap-1.5"><MapPin className="h-4 w-4 text-[#009FD9]" /> {t("workplacesLabel")}</label>
                        <p className="text-xs text-[#9ca3af]">
                          {t("workplacesHelp")}
                        </p>
                        <WorkplacesPicker value={workplaces} onChange={(n) => { setWorkplaces(n); setLocationError(null); }} />
                      </div>
                    )}
                    {serviceMobile && (
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold text-[#111827] flex items-center gap-1.5"><Truck className="h-4 w-4 text-[#009FD9]" /> {t("coverageLabel")}</label>
                        <p className="text-xs text-[#9ca3af]">
                          {t("coverageHelp")}
                        </p>
                        <CoverageAreaSelector value={coverageAreas} onChange={(n) => { setCoverageAreas(n); setLocationError(null); }} />
                      </div>
                    )}
                    {locationError && <p className="text-xs text-red-500">{locationError}</p>}
                  </div>
                )}
              </div>

              {/* WhatsApp */}
              <PhoneInput
                label={t("whatsapp")}
                required
                value={whatsappValue}
                onChange={(digits) => { setWhatsappValue(digits); form2.setValue("whatsapp", digits, { shouldValidate: true }); }}
                error={form2.formState.errors.whatsapp?.message}
              />

              <div className="flex gap-3 mt-2">
                {!currentUser && (
                  <Button variant="outline" size="lg" type="button" onClick={() => setStep(0)}>
                    <ArrowLeft className="h-4 w-4" /> {t("back")}
                  </Button>
                )}
                <Button type="submit" size="lg" className="flex-1">
                  {t("continue")} <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          )}

          {/* ── Step 2: Profile + Photo ──────────────────────────────────── */}
          {step === 2 && (
            <form noValidate onSubmit={form3.handleSubmit(onStep3, scrollToFirstError)} className="flex flex-col gap-4">
              {/* Photo upload — the only step-3 field. Guidance about services /
                  casos de éxito now lives in the panel's profile-completion flow. */}
              <PhotoPicker preview={photoPreview} onFile={handlePhotoSelect} onRemove={() => { setPhotoFile(null); setPhotoPreview(null); }} />

              <p className="text-sm text-[#6b7280] text-center">
                {t("photoCaption")}
              </p>

              <div className="flex gap-3 mt-2">
                <Button variant="outline" size="lg" type="button" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4" /> {t("back")}
                </Button>
                <Button
                  type="submit"
                  size="lg"
                  className="flex-1"
                  loading={submitting || uploadingPhoto}
                >
                  {uploadingPhoto
                    ? t("uploadingPhoto")
                    : submitting
                    ? t("creating")
                    : t("create")}
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
