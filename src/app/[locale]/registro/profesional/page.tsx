"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  CheckCircle2, ArrowRight, ArrowLeft, Loader2, AlertCircle,
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
import { getCategoryLabel, getAllCategories, normalizeText } from "@/lib/data/categories";
import { useCustomCategories } from "@/lib/data/use-custom-categories";
import { WorkplacesPicker, type Workplace } from "@/components/maps/workplaces-picker";
import { computeSearchAreas, primaryArea } from "@/lib/location";
import { useAvailabilityCheck } from "@/hooks/use-availability-check";
import { detectSocialOnly, providerLabel } from "@/lib/auth-method";
import { NAME_MAX_LENGTH, limitText } from "@/lib/text-limits";
import { writeStoredMode } from "@/hooks/use-mode";

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

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveGroupId(null);
  }, [open]);

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
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
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
            autoFocus
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

  // step: -1=loading, 0=identity (email/pw users), 1=service+location, 2=profile+photo
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
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
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
  const [accountCedula, setAccountCedula] = useState<string | null>("");
  // Additional categories (multi-category support). Primary = step2 `category`.
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [extraCatInput, setExtraCatInput] = useState("");
  // The extra-profession picker stays hidden behind a clear "+ Agregar otra
  // profesión" action so it never reads as a stray second dropdown.
  const [showExtraProf, setShowExtraProf] = useState(false);
  const [primaryServicePickerOpen, setPrimaryServicePickerOpen] = useState(false);
  const [extraServicePickerOpen, setExtraServicePickerOpen] = useState(false);
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
    setStep(1);
  }

  function onStep2(data: Step2Data) {
    // The WhatsApp number must match the exact digit length of its country.
    if (!isPhoneComplete(data.whatsapp)) {
      form2.setError("whatsapp", { message: t("errPhoneIncomplete") });
      return;
    }
    // At least one work zone (provincia/cantón) is required — it drives /buscar.
    if (workplaces.length === 0) {
      setLocationError(t("errWorkplace"));
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
      const fullName = limitText(step1Data.fullName.trim(), NAME_MAX_LENGTH);

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
              is_provider: true,
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
      const fullName = limitText(currentUser
        ? (oauthFullName.trim() ||
          (currentUser.user_metadata?.full_name as string) ||
          (currentUser.user_metadata?.name as string) ||
          (currentUser.email?.split("@")[0] ?? "profesional"))
        : step1Data!.fullName.trim(), NAME_MAX_LENGTH);

      const effWorkplaces = workplaces;
      const hasExactWorkplace = effWorkplaces.some((w) => w.lat != null && w.lng != null);
      const hasCoverageZone = effWorkplaces.some((w) => w.lat == null || w.lng == null);
      const serviceType = [hasExactWorkplace ? "fixed" : null, hasCoverageZone ? "mobile" : null].filter(Boolean).join(",") || "mobile";
      const { provincias, cantones } = computeSearchAreas(effWorkplaces, []);
      const primary = primaryArea(effWorkplaces, []);

      // ── 4. Create/upsert profile + professional record ─────────────────────
      const proRes = await fetch("/api/register/professional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          email: userEmail,
          fullName,
          businessName: limitText(businessName.trim(), NAME_MAX_LENGTH) || null,
          cedula: (noCrId || identityMismatch) ? null : (step1Data?.cedula?.replace(/\D/g, "") ?? (accountCedula || oauthCedula ? (accountCedula || oauthCedula).replace(/\D/g, "") : null)),
          // Skipping the cédula (noCrId) is a normal unverified registration — NOT a
          // review case. Only "¿No es tu información?" (identityMismatch) routes to
          // manual review; both simply mean no cédula is stored (so no auto-verify).
          noCrId: identityMismatch,
          idDocNote: identityMismatch ? "El usuario indicó que la información del padrón no es suya." : null,
          photoUrl,
          category: step2Data.category,
          professions: [step2Data.category, ...extraCategories],
          serviceType,
          province: primary.provinciaId ?? null,
          canton: primary.cantonId ?? null,
          // Work zones (provincia/cantón + optional pin) + denormalized search arrays.
          workplaces: effWorkplaces,
          coverageAreas: [],
          searchProvincias: provincias,
          searchCantones: cantones,
          coverageProvincias: [],
          coverageCountry: false,
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
          await supabase.auth.updateUser({ data: { role: "professional", is_provider: true, onboarding_completed: true } });
        } catch { /* best-effort */ }
        // Show the full-screen loader BEFORE navigating so the photo step never
        // flashes back. Hard navigation so the refreshed session (new role) is read.
        setRedirecting(true);
        writeStoredMode("offer");
        window.location.href = `/${locale}/dashboard/profesional?mode=offer`;
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
              <OtpVerification email={otpEmail} />
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

  const stepLabels = currentUser
    ? [t("steps.service"), t("steps.profile")]
    : [t("steps.identity"), t("steps.service"), t("steps.profile")];
  const indicatorStep = currentUser ? step - 1 : step;

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
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

          {/* ── OAuth identity confirmation ───────────────────────────────── */}
          {currentUser && (
            <div className="mb-4 overflow-hidden rounded-2xl border border-[#d8eef8] bg-[#f8fbfe]">
              <div className="px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[#6b7280]">
                    {connectedProviderLabel ? t("oauthConfirmedWithProvider", { provider: connectedProviderLabel }) : t("oauthConfirmed")}
                  </p>
                  <p className="truncate text-sm font-bold text-[#111827]">{currentUser.email}</p>
                </div>
              </div>
              {step === 1 && !noCrId && accountCedula && (
                <div className="border-t border-[#eef0f2] px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[#6b7280]">{t("identityAlreadyRegistered")}</p>
                    <p className="break-words text-sm font-bold text-[#111827]">{t("usesAccountId", { name: oauthFullName || t("yourAccount") })}</p>
                  </div>
                </div>
              )}
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
                error={form1.formState.errors.confirmPassword?.message}
                {...form1.register("confirmPassword")}
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
              {currentUser && !noCrId && !accountCedula ? (
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
              ) : null}
              {currentUser && noCrId && (
                <NoCrIdFields
                  fullName={oauthFullName}
                  onFullName={(n) => { setOauthFullName(limitText(n, NAME_MAX_LENGTH)); setOauthNameError(null); }}
                  nameError={oauthNameError ?? undefined}
                />
              )}

              {/* Disclosure attached to the identity field (hidden once a stored,
                  already-verified cédula is reused). */}
              {currentUser && !accountCedula && (
                <NoCrIdToggle checked={noCrId} onChange={setNoCrId} />
              )}

              {/* Profession — searchable combobox (a profesión groups the servicios
                  the pro later adds in their panel). */}
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
                  <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[#374151]">
                    {t("workplacesLabel")} <span className="text-red-500">*</span>
                  </label>
                  <WorkplacesPicker value={workplaces} onChange={(n) => { setWorkplaces(n); setLocationError(null); }} />
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
                {!currentUser && (
                  // Going BACK keeps the non-sensitive fields (nombre, cédula, correo —
                  // react-hook-form preserves them) but CLEARS the password + confirm so
                  // they're re-entered (safest/cleanest; a plain password shouldn't linger
                  // in form state across back-navigation).
                  <Button variant="outline" size="lg" type="button" onClick={() => { form1.setValue("password", ""); form1.setValue("confirmPassword", ""); setStep(0); }}>
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
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
