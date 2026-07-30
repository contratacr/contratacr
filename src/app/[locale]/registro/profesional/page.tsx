"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  CheckCircle2, ArrowRight, ArrowLeft, Loader2, AlertCircle, Video,
  Circle, Camera, X, Plus, Search, ChevronDown,
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
import { Modal } from "@/components/ui/modal";
import { CategorySuggestionBox } from "@/components/ui/category-suggestion";
import { CategoryGroupPicker, type CategoryPickerGroup } from "@/components/ui/category-group-picker";
import { anyVideoConsultCategory, getCategoryLabel, getAllCategories, normalizeText } from "@/lib/data/categories";
import { useCustomCategories } from "@/lib/data/use-custom-categories";
import { WorkplacesPicker, type Workplace } from "@/components/maps/workplaces-picker";
import { computeSearchAreas, primaryArea } from "@/lib/location";
import { useAvailabilityCheck } from "@/hooks/use-availability-check";
import { detectSocialOnly, providerLabel } from "@/lib/auth-method";
import { NAME_MAX_LENGTH, limitText } from "@/lib/text-limits";
import { writeStoredMode } from "@/hooks/use-mode";
import { IMAGE_ACCEPT } from "@/lib/upload-validation";
import { getImageUploadPreparationErrorCode, prepareImageForUpload } from "@/lib/client-image-upload";
import { trackMetaEvent } from "@/lib/analytics/meta-pixel";

// Category data lives in src/lib/data/categories.ts (single source of truth).
// The service catalog picker shares the same taxonomy and grouped UI used in
// the professional services panel.

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
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="text-red-500 hover:text-red-600">
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
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </div>
  );
}

function ServiceCatalogModal({
  open,
  title,
  excludedIds,
  defaultName,
  onClose,
  onSelect,
}: {
  open: boolean;
  title: string;
  excludedIds: string[];
  defaultName?: string;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("servicesEditor");
  const tp = useTranslations("categoriesPage");
  const customCategories = useCustomCategories();
  void customCategories;
  const [query, setQuery] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  function resetPicker() {
    setQuery("");
    setActiveGroupId(null);
  }

  const pickerList = useMemo(() => {
    const excluded = new Set(excludedIds);
    const base = getAllCategories().filter((c) => !excluded.has(c.id));
    const q = normalizeText(query.trim());
    if (!q) return base;
    return base.filter(
      (c) => normalizeText(getCategoryLabel(c.id, locale)).includes(q) || c.keywords.some((k) => normalizeText(k).includes(q))
    );
  }, [excludedIds, query, locale, customCategories]);

  const pickerGroups = useMemo<CategoryPickerGroup[]>(() => {
    const groups: CategoryPickerGroup[] = [];
    for (const cat of pickerList) {
      const last = groups[groups.length - 1];
      if (last && last.id === cat.groupId) last.items.push(cat);
      else groups.push({ id: cat.groupId, items: [cat] });
    }
    return groups;
  }, [pickerList]);

  function select(id: string) {
    onSelect(id);
    resetPicker();
    onClose();
  }

  function closePicker() {
    resetPicker();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={closePicker}
      title={title}
      closeLabel={t("cancel")}
      bodyClassName="px-0 py-0"
    >
      <div className="sticky top-0 z-10 bg-white px-5 pb-3 pt-4 sm:px-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveGroupId(null); }}
            placeholder={t("pickerSearch")}
            className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white pl-9 pr-4 text-sm text-[#111827] transition-all placeholder:text-[#9ca3af] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
          />
        </div>
      </div>
      <div className={cn("px-3 sm:px-4", pickerList.length === 0 && query.trim() ? "pb-2 pt-0" : "py-2")}>
        {pickerList.length === 0 && query.trim() ? null : query.trim() ? (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {pickerList.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => select(cat.id)}
                className="group flex items-center justify-between gap-2 rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-left text-sm font-medium text-[#374151] transition-all hover:border-[#009FD9] hover:bg-[#f8fbfe] hover:text-[#0089bb]"
              >
                <span className="min-w-0 [overflow-wrap:anywhere]">{getCategoryLabel(cat.id, locale)}</span>
                <Plus className="h-4 w-4 shrink-0 text-[#009FD9]" />
              </button>
            ))}
          </div>
        ) : (
          <CategoryGroupPicker
            groups={pickerGroups}
            activeGroupId={activeGroupId}
            onActiveGroupChange={setActiveGroupId}
            onSelect={select}
            backLabel={t("pickerBack")}
            countLabel={(count) => t("pickerOptionsCount", { count })}
            optionAction={<Plus className="h-4 w-4 shrink-0 text-[#009FD9]" />}
            optionClassName="rounded-xl border border-[#e5e7eb] bg-white hover:border-[#009FD9] hover:bg-[#f8fbfe]"
          />
        )}

        <div className={cn("text-center", pickerList.length === 0 && query.trim() ? "mt-1" : "mt-4")}>
          <p className="text-sm font-extrabold text-[#162543]">{tp("notListed")}</p>
          <p className="mx-auto mt-1 max-w-[280px] text-xs leading-5 text-[#6b7280]">
            {tp("suggestDescription")}
          </p>
          <CategorySuggestionBox
            className="mt-3"
            prominent
            notListedLabel={tp("suggestCta")}
            placeholder={t("suggestNamePlaceholder")}
            sendLabel={t("suggestSend")}
            sendingLabel={t("suggestSending")}
            cancelLabel={t("cancel")}
            thanksLabel={t("suggestThanks")}
            defaultName={query || defaultName}
          />
        </div>
      </div>
    </Modal>
  );
}

function ServicePickerTrigger({
  value,
  placeholder,
  onClick,
  error,
}: {
  value?: string;
  placeholder: string;
  onClick: () => void;
  error?: string;
}) {
  const locale = useLocale();
  const selectedLabel = value ? getCategoryLabel(value, locale) : "";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-invalid={!!error}
      className={cn(
        "group flex h-11 w-full items-center justify-between gap-3 rounded-xl border bg-white px-3.5 text-left text-sm transition-all hover:border-[#009FD9] hover:bg-[#f8fbfe]",
        error ? "border-red-400" : "border-[#e5e7eb]"
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {selectedLabel ? (
          <span className="truncate font-medium text-[#111827]">{selectedLabel}</span>
        ) : (
          <>
            <Search className="h-4 w-4 shrink-0 text-[#9ca3af]" />
            <span className="truncate text-[#9ca3af]">{placeholder}</span>
          </>
        )}
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-[#9ca3af] transition-colors group-hover:text-[#009FD9]" />
    </button>
  );
}

// ─── "Registrarme sin cédula" (skip identity verification) ────────────────────
// A pro can register WITHOUT a cédula: they simply appear without the "Verificado"
// badge and can verify later from their panel. This is a low-friction choice, not
// an exceptions/review case. Subtle disclosure anchored under the cédula field.
function NoCrIdToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const t = useTranslations("registration.pro");
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="self-start text-sm font-medium text-[#009FD9] hover:underline cursor-pointer"
    >
      {checked ? t("hasCrIdLink") : t("noCrIdLink")}
    </button>
  );
}

function NoCrIdFields({
  fullName, onFullName, nameError,
}: {
  fullName: string; onFullName: (v: string) => void; nameError?: string;
}) {
  const t = useTranslations("registration.pro");
  return (
    <div className="flex flex-col gap-3">
      <Input
        label={<>{t("manualName")} <span className="text-red-500">*</span></>}
        placeholder={t("manualNameHint")}
        value={fullName}
        maxLength={NAME_MAX_LENGTH}
        onChange={(e) => onFullName(limitText(e.target.value, NAME_MAX_LENGTH))}
        error={nameError}
      />
      <p className="flex items-start gap-2 text-xs text-[#6b7280]">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#9ca3af]" />
        <span>{t("skipCedulaNote")}</span>
      </p>
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
        fullName: z.string().min(3, t("valNameRequired")).max(NAME_MAX_LENGTH, t("valNameRequired")),
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
  const authMetadata = currentUser?.app_metadata as { provider?: string; providers?: string[] } | undefined;
  const connectedProvider =
    authMetadata?.provider && authMetadata.provider !== "email"
      ? authMetadata.provider
      : authMetadata?.providers?.find((provider) => provider !== "email") ?? null;
  const connectedProviderLabel = connectedProvider ? providerLabel(connectedProvider) : null;

  // step: -1=loading, 0=identity/account, 1=service+location, 2=profile+photo
  const [step, setStep] = useState(-1);
  const [whatsappValue, setWhatsappValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // After a successful create we navigate to the panel. Render a full-screen
  // loader meanwhile so the form/step never flashes back (item 6).
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const formTopRef = useRef<HTMLDivElement | null>(null);
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [videoCoverageCountry, setVideoCoverageCountry] = useState(false);
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
  const [oauthFullName, setOauthFullName] = useState("");
  const [oauthNameError, setOauthNameError] = useState<string | null>(null);
  // A converting client may already have a verified cédula on file — never re-ask
  // for it (re-entering would error as "already registered"). null = still loading.
  const [accountCedula, setAccountCedula] = useState<string | null>(null);
  // Additional categories (multi-category support). Primary = step2 `category`.
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [extraCatInput, setExtraCatInput] = useState("");
  // The extra-profession picker stays hidden behind a clear "+ Agregar otra
  // profesión" action so it never reads as a stray second dropdown.
  const [showExtraProf, setShowExtraProf] = useState(false);
  const [primaryServicePickerOpen, setPrimaryServicePickerOpen] = useState(false);
  const [extraServicePickerOpen, setExtraServicePickerOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [publicBusinessNameOnly, setPublicBusinessNameOnly] = useState(false);

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
  const watchedPrimaryCategory = form2.watch("category");
  const selectedServiceIds = useMemo(
    () => [watchedPrimaryCategory, ...extraCategories].filter(Boolean),
    [watchedPrimaryCategory, extraCategories],
  );
  const canOfferVideoConsult = useMemo(
    () => anyVideoConsultCategory(selectedServiceIds),
    [selectedServiceIds],
  );
  const effectiveVideoCoverageCountry = canOfferVideoConsult && videoCoverageCountry;
  const pendingProfessionalSignup =
    currentUser?.user_metadata?.professional_signup_started === true &&
    currentUser.user_metadata?.is_provider !== true;

  useEffect(() => {
    if (step < 0 || otpEmail || redirecting) return;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      formTopRef.current?.scrollIntoView({ block: "start", inline: "nearest" });
    });
  }, [otpEmail, redirecting, step]);

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
  const watchedConfirmPassword = form1.watch("confirmPassword") ?? "";
  const watchedEmail = form1.watch("email") ?? "";
  const watchedCedula = form1.watch("cedula") ?? "";
  const confirmPasswordFieldError = form1.formState.errors.confirmPassword?.message;
  const confirmPasswordMismatch = watchedConfirmPassword.length > 0 && watchedPassword !== watchedConfirmPassword;
  const confirmPasswordMatches = watchedConfirmPassword.length > 0 && watchedPassword === watchedConfirmPassword;
  const confirmPasswordError = confirmPasswordMismatch
    ? tRp("passwordsDontMatch")
    : confirmPasswordMatches
      ? undefined
      : confirmPasswordFieldError;

  useEffect(() => {
    if (!watchedConfirmPassword && !confirmPasswordFieldError) return;
    void form1.trigger("confirmPassword");
  }, [confirmPasswordFieldError, form1, watchedPassword, watchedConfirmPassword]);

  // Real-time duplicate detection (email/password identity step)
  const emailCheck = useAvailabilityCheck(watchedEmail, "email", !currentUser);
  const cedulaCheck = useAvailabilityCheck(watchedCedula, "cedula", !currentUser);
  // Real-time cédula check for OAuth professionals
  const oauthCedulaCheck = useAvailabilityCheck(oauthCedula, "cedula", !!currentUser);

  useEffect(() => {
    if (!authLoading) {
      setStep((prev) => (prev === -1 ? 0 : prev));
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

  useEffect(() => {
    if (!currentUser || !pendingProfessionalSignup || accountCedula === null || step !== 0) return;
    if (accountCedula || oauthFullName.trim().length >= 3) {
      setStep(1);
    }
  }, [accountCedula, currentUser, oauthFullName, pendingProfessionalSignup, step]);

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
        writeStoredMode("offer");
        router.replace("/dashboard/profesional?mode=offer");
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

  async function onStep1(data: Step1Data) {
    if (emailCheck.taken) {
      // If the existing account is social-only, guide to that provider specifically.
      const provider = await detectSocialOnly(data.email);
      form1.setError("email", { message: provider ? t("errSocialAccount", { provider: providerLabel(provider) }) : t("errEmailTaken") });
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

    if (currentUser) {
      setStep(1);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const fullName = limitText(data.fullName.trim(), NAME_MAX_LENGTH);
      const skipCedula = noCrId || identityMismatch;
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: fullName,
            cedula: skipCedula ? null : data.cedula.replace(/\D/g, ""),
            role: "client",
            intended_role: "professional",
            professional_signup_started: true,
            professional_no_cr_id: noCrId,
            professional_identity_mismatch: identityMismatch,
            onboarding_completed: true,
          },
        },
      });

      if (signUpError) throw signUpError;
      if (!signUpData.user?.id) throw new Error(t("errCreateAccount"));
      if (Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0) {
        throw new Error(t("errAccountExists"));
      }

      if (signUpData.session) {
        setStep(1);
      } else {
        setOtpEmail(data.email);
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
        const provider = await detectSocialOnly(data.email);
        form1.setError("email", { message: provider ? t("errSocialAccount", { provider: providerLabel(provider) }) : t("errAccountExists") });
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function onCurrentUserIdentityContinue() {
    if (accountCedula) {
      setOauthCedulaError(null);
      setOauthNameError(null);
      setStep(1);
      return;
    }
    if (!noCrId && !identityMismatch && !validateCedulaFormat(oauthCedula)) {
      setOauthCedulaError(t("errIdRequired"));
      return;
    }
    if (!noCrId && !identityMismatch && oauthCedulaCheck.taken) {
      setOauthCedulaError(t("errIdTaken"));
      return;
    }
    if (oauthFullName.trim().length < 3) {
      setOauthNameError(t("errNameRequired"));
      return;
    }
    setOauthNameError(null);
    setOauthCedulaError(null);
    setStep(1);
  }

  function onStep2(data: Step2Data) {
    // The WhatsApp number must match the exact digit length of its country.
    if (!isPhoneComplete(data.whatsapp)) {
      form2.setError("whatsapp", { message: t("errPhoneIncomplete") });
      return;
    }
    // At least one work zone (provincia/cantón) is required — it drives /buscar.
    if (workplaces.length === 0 && !effectiveVideoCoverageCountry) {
      setLocationError(canOfferVideoConsult ? t("errWorkplace") : t("errWorkplaceInPerson"));
      return;
    }
    setLocationError(null);
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
        try {
          setUploadingPhoto(true);
          const preparedFile = await prepareImageForUpload(photoFile, { maxDimension: 1200 });
          const fd = new FormData();
          fd.append("file", preparedFile);
          fd.append("type", "avatar");
          const uploadRes = await fetch("/api/upload/photo", { method: "POST", body: fd });
          if (uploadRes.ok) {
            const { url } = await uploadRes.json();
            photoUrl = url;
          } else {
            const data = await uploadRes.json().catch(() => ({}));
            throw new Error(data?.error || t("photoError"));
          }
        } catch (error) {
          const code = getImageUploadPreparationErrorCode(error);
          setError(code === "too_large" ? t("photoTooLarge") : code === "unsupported" ? t("photoUnsupported") : error instanceof Error && error.message ? error.message : t("photoError"));
          setSubmitting(false);
          setUploadingPhoto(false);
          return;
        } finally {
          setUploadingPhoto(false);
        }
      }

      const supabase = createClient();
      let submitUser = currentUser;
      if (!submitUser) {
        const { data: sessionData } = await supabase.auth.getUser();
        submitUser = sessionData.user;
      }
      if (!submitUser) throw new Error(t("errCreateAccount"));

      const userId = submitUser.id;
      const userEmail = submitUser.email ?? step1Data?.email ?? "";

      // ── 3. Build names for the profile upsert ─────────────────────────────
      const fullName = limitText(
        oauthFullName.trim() ||
          (submitUser.user_metadata?.full_name as string) ||
          (submitUser.user_metadata?.name as string) ||
          (submitUser.email?.split("@")[0] ?? "profesional"),
        NAME_MAX_LENGTH,
      );

      const effWorkplaces = workplaces;
      const selectedProfessions = [step2Data.category, ...extraCategories].filter(Boolean);
      const submitVideoCoverageCountry = anyVideoConsultCategory(selectedProfessions) && videoCoverageCountry;
      const onlineCoverage = submitVideoCoverageCountry ? [{ level: "country" as const }] : [];
      const hasExactWorkplace = effWorkplaces.some((w) => w.lat != null && w.lng != null);
      const hasCoverageZone = effWorkplaces.some((w) => w.lat == null || w.lng == null) || submitVideoCoverageCountry;
      const serviceType = [hasExactWorkplace ? "fixed" : null, hasCoverageZone ? "mobile" : null].filter(Boolean).join(",") || "mobile";
      const { provincias, cantones, coverageProvincias, coverageCountry } = computeSearchAreas(effWorkplaces, onlineCoverage);
      const primary = primaryArea(effWorkplaces, onlineCoverage);
      const submitMetadata = submitUser.user_metadata ?? {};
      const storedNoCrId = submitMetadata.professional_no_cr_id === true;
      const storedIdentityMismatch = submitMetadata.professional_identity_mismatch === true;
      const skipCedula = noCrId || identityMismatch || storedNoCrId || storedIdentityMismatch;

      // ── 4. Create/upsert profile + professional record ─────────────────────
      const proRes = await fetch("/api/register/professional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          email: userEmail,
          fullName,
          businessName: limitText(businessName.trim(), NAME_MAX_LENGTH) || null,
          publicBusinessNameOnly: !!businessName.trim() && publicBusinessNameOnly,
          cedula: skipCedula ? null : (step1Data?.cedula?.replace(/\D/g, "") ?? (accountCedula || oauthCedula ? (accountCedula || oauthCedula).replace(/\D/g, "") : null)),
          // Skipping the cédula (noCrId) is a normal unverified registration — NOT a
          // review case. Only "¿No es tu información?" (identityMismatch) routes to
          // manual review; both simply mean no cédula is stored (so no auto-verify).
          noCrId: identityMismatch || storedIdentityMismatch,
          idDocNote: (identityMismatch || storedIdentityMismatch) ? "El usuario indicó que la información del padrón no es suya." : null,
          photoUrl,
          category: step2Data.category,
          professions: selectedProfessions,
          serviceType,
          province: primary.provinciaId ?? null,
          canton: primary.cantonId ?? null,
          // Work zones (provincia/cantón + optional pin) + denormalized search arrays.
          workplaces: effWorkplaces,
          coverageAreas: onlineCoverage,
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
      const proResult = await proRes.json().catch(() => ({}));
      const opportunityCount = Number(proResult?.opportunityCount ?? 0);

      // Persist the professional role in auth metadata too, so navigating away
      // and back never reverts to the role-selection screen (and a converted
      // client stays professional across sessions).
      try {
        await supabase.auth.updateUser({
          data: {
            role: "professional",
            intended_role: null,
            is_provider: true,
            professional_signup_started: false,
            professional_no_cr_id: false,
            professional_identity_mismatch: false,
            onboarding_completed: true,
          },
        });
      } catch { /* best-effort */ }
      // Show the full-screen loader BEFORE navigating so the photo step never
      // flashes back. Hard navigation so the refreshed session (new role) is read.
      setRedirecting(true);
      writeStoredMode("offer");
      trackMetaEvent("CompleteRegistration", {
        content_name: "professional_registration",
        status: "professional",
      });
      const welcomeParams = opportunityCount > 0 ? `&welcomeOpportunities=1&welcomeOpportunityCount=${opportunityCount}` : "";
      window.location.href = `/${locale}/dashboard/profesional?mode=offer${welcomeParams}`;
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("errTitle");
      if (
        msg.includes("already registered") ||
        msg.includes("already been registered") ||
        msg.includes("already exists") ||
        msg.includes("ya está registrado") ||
        msg.includes("Ya existe una cuenta")
      ) {
        // Specific guidance when the existing account is social-only (use Google).
        const provider = step1Data?.email ? await detectSocialOnly(step1Data.email) : null;
        setError(provider ? t("errSocialAccount", { provider: providerLabel(provider) }) : t("errAccountExists"));
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
      <div className="min-h-screen flex flex-col bg-[#fafafa]">
        <Navbar />
        <main className="flex-1 flex items-center justify-center py-12 px-4">
          <div className="w-full max-w-sm">
            <div className="bg-white rounded-3xl shadow-sm border border-[#e5e7eb] p-8">
              <OtpVerification email={otpEmail} onVerified={() => { setOtpEmail(null); setStep(1); }} />
            </div>
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

  const stepLabels = [t("steps.identity"), t("steps.service"), t("steps.profile")];
  const indicatorStep = step;
  const hasBusinessName = businessName.trim().length > 0;
  const businessNameOnlyLabel = locale === "en" ? "Show only business name" : "Mostrar solo nombre comercial";
  const businessNameField = (
    <div className="space-y-2.5">
      <Input
        label={<>{t("businessName")} <span className="text-[#9ca3af] font-normal">{t("optionalParen")}</span></>}
        placeholder={t("businessPlaceholder")}
        value={businessName}
        maxLength={NAME_MAX_LENGTH}
        onChange={(e) => {
          const next = limitText(e.target.value, NAME_MAX_LENGTH);
          setBusinessName(next);
          if (!next.trim()) setPublicBusinessNameOnly(false);
        }}
      />
      {hasBusinessName && (
        <div className="flex items-center justify-between gap-4 rounded-xl bg-[#f9fafb] p-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#111827]">{businessNameOnlyLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => setPublicBusinessNameOnly((value) => !value)}
            className={cn("relative h-6 w-11 shrink-0 rounded-full transition-all", publicBusinessNameOnly ? "bg-[#009FD9]" : "bg-[#d1d5db]")}
            aria-label={businessNameOnlyLabel}
            aria-pressed={publicBusinessNameOnly}
          >
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", publicBusinessNameOnly ? "left-5" : "left-0.5")} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div ref={formTopRef} className="w-full max-w-md scroll-mt-24">
          {/* Same container treatment as the client registration ("Crear cuenta de
              cliente"): a clean white card (rounded-3xl, hairline border, soft shadow,
              p-8) on a #fafafa page, centered. The multi-step form lives inside it. */}
          <div className="bg-white rounded-3xl shadow-sm border border-[#e5e7eb] p-8">
          <div className="text-center mb-2">
            {/* Heading only — the per-step subtitles were filler (minimal-text principle). */}
            <h1 className="text-2xl font-bold text-[#111827]">
              {step === 2 ? t("photoStepTitle") : currentUser ? t("completeProfileTitle") : t("title")}
            </h1>
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

          {/* ── OAuth identity confirmation (identity step only) ───────────── */}
          {currentUser && step === 0 && (
            <div className="mb-4 overflow-hidden rounded-2xl border border-[#d8eef8] bg-[#f8fbfe]">
              <div className="px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[#6b7280]">
                    {connectedProviderLabel ? t("oauthConfirmedWithProvider", { provider: connectedProviderLabel }) : t("oauthConfirmed")}
                  </p>
                  <p className="truncate text-sm font-bold text-[#111827]">{currentUser.email}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 0: Identity / account confirmation ─────────────────── */}
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
                    onFullNameChange={(n) => form1.setValue("fullName", limitText(n, NAME_MAX_LENGTH), { shouldValidate: true })}
                    onResult={(r) => { if (r.found) setIdentityMismatch(false); }}
                    onMismatch={() => setIdentityMismatch(true)}
                    cedulaError={form1.formState.errors.cedula?.message ?? (!identityMismatch && cedulaCheck.taken ? t("errIdentificationTaken") : undefined)}
                    nameError={form1.formState.errors.fullName?.message}
                  />
                </>
              ) : (
                <NoCrIdFields
                  fullName={form1.watch("fullName") ?? ""}
                  onFullName={(n) => form1.setValue("fullName", limitText(n, NAME_MAX_LENGTH), { shouldValidate: true })}
                  nameError={form1.formState.errors.fullName?.message}
                />
              )}

              {/* Belongs to the identification field — a subtle disclosure right
                  under it, not a floating checkbox at the end of the form. */}
              <NoCrIdToggle checked={noCrId} onChange={setNoCrId} />

              {businessNameField}

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
                  type="password"
                  placeholder={t("passwordPlaceholder")}
                  error={form1.formState.errors.password?.message}
                  {...form1.register("password")}
                />
                <PasswordChecklist password={watchedPassword} />
              </div>

              <Input
                label={<>{t("confirmPassword")} <span className="text-red-500">*</span></>}
                type="password"
                placeholder="••••••••"
                error={confirmPasswordError}
                {...form1.register("confirmPassword")}
              />

              <Button type="submit" size="lg" className="mt-2" loading={submitting} disabled={submitting}>
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

          {/* ── Step 0: Identity for an already-connected account ─────────── */}
          {step === 0 && currentUser && (
            <div className="flex flex-col gap-4">
              {accountCedula === null ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-[#009FD9]" />
                </div>
              ) : accountCedula ? (
                <div className="rounded-2xl border border-[#d8eef8] bg-[#f8fbfe] px-4 py-3">
                  <p className="text-xs font-semibold text-[#6b7280]">{t("identityAlreadyRegistered")}</p>
                  <p className="mt-1 break-words text-sm font-bold text-[#111827]">
                    {t("usesAccountId", { name: oauthFullName || t("yourAccount") })}
                  </p>
                </div>
              ) : !noCrId ? (
                <IdentityField
                  cedula={oauthCedula}
                  fullName={oauthFullName}
                  onCedulaChange={(c) => { setOauthCedula(c); setOauthCedulaError(null); }}
                  onFullNameChange={(n) => { setOauthFullName(limitText(n, NAME_MAX_LENGTH)); setOauthNameError(null); }}
                  onResult={(r) => { if (r.found) setIdentityMismatch(false); }}
                  onMismatch={() => setIdentityMismatch(true)}
                  cedulaError={oauthCedulaError ?? (!identityMismatch && oauthCedulaCheck.taken ? t("errIdentificationTaken") : undefined)}
                  nameError={oauthNameError ?? undefined}
                />
              ) : (
                <NoCrIdFields
                  fullName={oauthFullName}
                  onFullName={(n) => { setOauthFullName(limitText(n, NAME_MAX_LENGTH)); setOauthNameError(null); }}
                  nameError={oauthNameError ?? undefined}
                />
              )}

              {accountCedula === "" && (
                <NoCrIdToggle checked={noCrId} onChange={setNoCrId} />
              )}

              {accountCedula !== null && businessNameField}

              <Button
                type="button"
                size="lg"
                className="mt-2"
                disabled={accountCedula === null}
                onClick={onCurrentUserIdentityContinue}
              >
                {t("continue")} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {step === 1 && (
            <form noValidate onSubmit={form2.handleSubmit(onStep2, scrollToFirstError)} className="flex flex-col gap-4">

              {/* Profession: searchable service combobox. */}
              <section className="flex flex-col gap-3">
                <div>
                  <h3 className="text-sm font-extrabold text-[#162543]">{t("servicesSectionTitle")}</h3>
                  <div className="mt-3">
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("professionPrincipal")} <span className="text-red-500">*</span>
                </label>
                <ServicePickerTrigger
                  value={form2.watch("category") ?? ""}
                  onClick={() => setPrimaryServicePickerOpen(true)}
                  placeholder={t("searchProfession")}
                  error={form2.formState.errors.category?.message}
                />
                <ServiceCatalogModal
                  open={primaryServicePickerOpen}
                  title={t("professionPrincipal")}
                  excludedIds={extraCategories}
                  onClose={() => setPrimaryServicePickerOpen(false)}
                  onSelect={(v) => {
                    form2.setValue("category", v, { shouldValidate: true });
                    setExtraCategories((prev) => prev.filter((x) => x !== v));
                  }}
                />
                {form2.formState.errors.category?.message && (
                  <p className="mt-1 text-xs text-red-500">
                    {form2.formState.errors.category.message}
                  </p>
                )}

                {/* Additional professions (optional, multi-profession). The picker
                    is revealed by an explicit "+ Agregar otra profesión" action so
                    it reads as a clear ADD, not a second dropdown. */}
                <div className="mt-2 flex flex-col gap-2">
                  {extraCategories.length > 0 && (
                    <div className="flex flex-wrap gap-2">
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
                    <>
                      <ServicePickerTrigger
                        value={extraCatInput}
                        onClick={() => setExtraServicePickerOpen(true)}
                        placeholder={t("searchAnotherProfession")}
                      />
                      <ServiceCatalogModal
                        open={extraServicePickerOpen}
                        title={t("addAnotherProfession")}
                        excludedIds={[form2.watch("category") ?? "", ...extraCategories].filter(Boolean)}
                        onClose={() => {
                          setExtraServicePickerOpen(false);
                          setShowExtraProf(false);
                        }}
                        onSelect={(v) => {
                          const primary = form2.watch("category");
                          if (v && v !== primary && !extraCategories.includes(v)) {
                            setExtraCategories((prev) => [...prev, v]);
                          }
                          setExtraCatInput("");
                          setShowExtraProf(false);
                        }}
                      />
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setShowExtraProf(true);
                        setExtraServicePickerOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-[#009FD9] hover:underline cursor-pointer"
                    >
                      <Plus className="h-4 w-4" /> {t("addAnotherProfession")}
                    </button>
                  )}
                  </div>
                </div>

              {/* Work zones — provincia/cantón FIRST (drives /buscar), optional exact
                  pin. "Me desplazo" travel is enabled later in the panel. */}
                </div>
              </section>
              <section className="flex flex-col gap-3 border-t border-[#f3f4f6] pt-4">
                  <h3 className="text-sm font-extrabold text-[#162543]">{t("workplacesSectionTitle")}</h3>
                  {canOfferVideoConsult && (
                    <div className="flex flex-col gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[#162543]">{t("videoSectionTitle")}</p>
                        <p className="text-xs leading-5 text-[#64748b]">{t("videoSectionHint")}</p>
                      </div>
                      {effectiveVideoCoverageCountry ? (
                        <div className="flex items-center gap-2 rounded-xl bg-[#EBF5FB] px-3 py-2">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#009FD9]">
                            <Video className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[#0089bb]">{t("videoCountryPlace")}</p>
                            <p className="truncate text-xs text-[#64748b]">{t("videoConsultOption")}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setVideoCoverageCountry(false)}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#9ca3af] transition-colors hover:bg-red-50 hover:text-red-500"
                            aria-label={t("videoCountryRemove")}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setVideoCoverageCountry(true);
                            setLocationError(null);
                          }}
                          className="inline-flex w-full max-w-full items-center gap-2 rounded-full border border-[#bfeeff] bg-white px-3 py-2 text-sm font-semibold text-[#009FD9] shadow-sm transition hover:border-[#009FD9] hover:bg-[#f0fbff] sm:w-fit"
                        >
                          <Plus className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1 text-left leading-tight sm:flex sm:flex-none sm:items-center sm:gap-1.5">
                            <span className="block truncate">{t("videoCountryAdd")}</span>
                            <span className="block truncate text-xs font-semibold text-[#64748b] sm:inline">
                              ({t("videoConsultOption")})
                            </span>
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[#374151]">
                    {canOfferVideoConsult ? t("inPersonSectionTitle") : t("workplacesLabel")}
                    {!canOfferVideoConsult && <span className="text-red-500"> *</span>}
                  </label>
                  <WorkplacesPicker
                    value={workplaces}
                    onChange={(n) => { setWorkplaces(n); setLocationError(null); }}
                  />
                </div>

                  {locationError && <p className="text-xs text-red-500">{locationError}</p>}
              </section>

              {/* WhatsApp */}
              <section className="border-t border-[#f3f4f6] pt-4">
                  <h3 className="mb-3 text-sm font-extrabold text-[#162543]">{t("contactSectionTitle")}</h3>
                  <PhoneInput
                    label={t("whatsapp")}
                    required
                    value={whatsappValue}
                    onChange={(digits) => { setWhatsappValue(digits); form2.setValue("whatsapp", digits, { shouldValidate: true }); }}
                    error={form2.formState.errors.whatsapp?.message}
                  />
              </section>

              <div className="flex gap-3 mt-2">
                <Button
                  variant="outline"
                  size="lg"
                  type="button"
                  onClick={() => {
                    if (!currentUser) {
                      form1.setValue("password", "");
                      form1.setValue("confirmPassword", "");
                    }
                    setStep(0);
                  }}
                >
                  <ArrowLeft className="h-4 w-4" /> {t("back")}
                </Button>
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

              <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                <Button variant="outline" size="lg" type="button" onClick={() => setStep(1)} className="px-4 sm:px-7">
                  <ArrowLeft className="h-4 w-4" /> {t("back")}
                </Button>
                <Button
                  type="submit"
                  size="lg"
                  className="min-w-0 px-4 sm:px-7"
                  loading={submitting || uploadingPhoto}
                >
                  <span className="min-w-0 truncate">
                    {uploadingPhoto
                      ? t("uploadingPhoto")
                      : submitting
                      ? t("creating")
                      : t("create")}
                  </span>
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
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
