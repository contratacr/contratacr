"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, BadgeCheck, ImagePlus, Loader2, Plus, Trash2, Pencil, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PriceInput } from "@/components/ui/price-input";
import { Modal } from "@/components/ui/modal";
import { CategorySearch } from "@/components/ui/category-search";
import { CategorySuggestionBox } from "@/components/ui/category-suggestion";
import { CategoryGroupPicker, type CategoryPickerGroup } from "@/components/ui/category-group-picker";
import { SelectMenu } from "@/components/ui/select-menu";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { anyVideoConsultCategory, getCategoryLabel, getAllCategories, normalizeText } from "@/lib/data/categories";
import { useCustomCategories } from "@/lib/data/use-custom-categories";
import { PRICING_TYPES, TAX_INCLUDED_SUFFIX, formatServicePrice, splitPricingLabel, type PricingType } from "@/lib/pricing";
import { useReportSaveStatus } from "@/components/dashboard/save-status-context";
import { UnsavedChangesGuard } from "@/components/dashboard/unsaved-changes-guard";
import { parseMoneyAmount } from "@/lib/money-limits";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { IMAGE_ACCEPT } from "@/lib/upload-validation";
import { getImageUploadPreparationErrorCode, prepareImageForUpload, uploadPhotoFormDataWithRetry } from "@/lib/client-image-upload";
import { professionalCredentialSuggestion, serviceSupportsProfessionalCredential } from "@/lib/professional-credentials";

export type ProService = {
  id: string;
  name: string;
  description?: string;
  price?: string;          // display string (kept in sync from amount+type)
  priceAmount?: number;    // colones (optional)
  priceType?: PricingType; // por_hora | por_proyecto | …
  years?: number;          // years of experience in THIS service
  months?: number;         // extra months of experience in THIS service
  startedAt?: string;      // YYYY-MM: when this service started
  imageUrl?: string;       // optional public cover image for this service
  professionalCredentialLabel?: string;
  professionalCredentialNumber?: string;
  professionalCredentialIssuer?: string;
  // Which service (category id) this info belongs to. The model is SERVICES-ONLY:
  // each service the pro offers = one catalog category, with ONE info object.
  category?: string;
  // Active/inactive toggle (sprint 486). An INACTIVE service is "paused" — kept in the
  // editor but HIDDEN from clients (public profile). Undefined/true = active (back-compat).
  active?: boolean;
};

interface ServicesEditorProps {
  professionalId: string;
  primaryCategory?: string;
  initialProfessions?: string[];
  initialServices?: ProService[];
  onSaved?: (intent?: "section" | "internal") => void;
  focusField?: string | null;
  focusKey?: number;
}

function genId() {
  return `svc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Price units offered in the service modal's <select> (the "Consultar precio"
// checkbox covers a_convenir separately, so it's excluded here).
const PRICE_UNITS = PRICING_TYPES.filter((p) => p.value !== "a_convenir");

interface ServiceFormState {
  description: string;
  priceUnit: PricingType;   // a non-a_convenir unit (por_hora, por_proyecto, …)
  priceAmount: string;
  aConsultar: boolean;      // "Consultar precio" → persists as priceType a_convenir
  startedAt: string;
  imageUrl: string;
  professionalCredentialLabel: string;
  professionalCredentialNumber: string;
  professionalCredentialIssuer: string;
}
const EMPTY_FORM: ServiceFormState = { description: "", priceUnit: "por_hora", priceAmount: "", aConsultar: false, startedAt: "", imageUrl: "", professionalCredentialLabel: "", professionalCredentialNumber: "", professionalCredentialIssuer: "" };
const SERVICE_DESCRIPTION_MAX_LENGTH = 600;
const PROFESSIONAL_CREDENTIAL_MAX_LENGTH = 80;

function ServiceActiveToggle({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
        checked ? "border-[#009FD9] bg-[#009FD9]" : "border-[#cbd5e1] bg-[#e2e8f0]",
      )}
    >
      <span
        className={cn(
          "h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.22)] transition-transform",
          checked ? "translate-x-[21px]" : "translate-x-0.5",
        )}
      />
    </span>
  );
}

function trimCredential(value: string) {
  return value.trim().slice(0, PROFESSIONAL_CREDENTIAL_MAX_LENGTH);
}

function monthValueFromExperience(years?: number, months?: number) {
  const totalMonths = Math.max(0, (years ?? 0) * 12 + (months ?? 0));
  if (totalMonths <= 0) return "";
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - totalMonths, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function experienceFromMonthValue(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const [yearRaw, monthRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  const now = new Date();
  const currentTotal = now.getFullYear() * 12 + now.getMonth();
  const startedTotal = year * 12 + (month - 1);
  const diff = currentTotal - startedTotal;
  if (diff < 0) return null;
  return { years: Math.floor(diff / 12), months: diff % 12 };
}

function monthLabel(month: number, locale: string) {
  const dateLocale = locale === "en" ? "en-US" : "es-CR";
  const label = new Date(2026, month - 1, 1).toLocaleDateString(dateLocale, { month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function ServiceStartMonthPicker({
  value,
  onChange,
  locale,
}: {
  value: string;
  onChange: (value: string) => void;
  locale: string;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const selectedYear = /^\d{4}-\d{2}$/.test(value) ? value.slice(0, 4) : "";
  const selectedMonth = /^\d{4}-\d{2}$/.test(value) ? String(Number(value.slice(5, 7))) : "";
  const yearOptions = Array.from({ length: currentYear - 1970 + 1 }, (_, index) => {
    const year = currentYear - index;
    return { value: String(year), label: String(year) };
  });
  const maxMonth = selectedYear && Number(selectedYear) === currentYear ? currentMonth : 12;
  const monthOptions = Array.from({ length: maxMonth }, (_, index) => {
    const month = index + 1;
    return { value: String(month), label: monthLabel(month, locale) };
  });
  const commit = (year: string, month: string) => {
    if (!year || !month) {
      onChange("");
      return;
    }
    onChange(`${year}-${String(Number(month)).padStart(2, "0")}`);
  };
  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        <SelectMenu
          value={selectedMonth}
          onChange={(month) => commit(selectedYear || String(currentYear), month)}
          options={monthOptions}
          placeholder={locale === "en" ? "Month" : "Mes"}
        />
        <SelectMenu
          value={selectedYear}
          onChange={(year) => {
            const month = selectedMonth && Number(selectedMonth) <= (Number(year) === currentYear ? currentMonth : 12)
              ? selectedMonth
              : "";
            commit(year, month);
          }}
          options={yearOptions}
          placeholder={locale === "en" ? "Year" : "Año"}
        />
      </div>
    </div>
  );
}

export function ServicesEditor({
  professionalId,
  primaryCategory,
  initialProfessions = [],
  initialServices = [],
  onSaved,
  focusField,
  focusKey,
}: ServicesEditorProps) {
  const locale = useLocale();
  const t = useTranslations("servicesEditor");
  const tp = useTranslations("categoriesPage");
  const seedProfessions =
    initialProfessions.length > 0
      ? initialProfessions
      : primaryCategory
        ? [primaryCategory]
        : [];

  // The pro's SERVICES = a list of catalog category ids (services-only model).
  const [professions, setProfessions] = useState<string[]>(seedProfessions);
  // Per-service INFO objects (one per service/category — consolidated on edit).
  const [services, setServices] = useState<ProService[]>(initialServices);

  // Service picker (modal): used for both adding and changing a service.
  const [pickerMode, setPickerMode] = useState<"add" | "change" | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [activePickerGroupId, setActivePickerGroupId] = useState<string | null>(null);
  // Admin-approved custom categories — selectable as services too.
  const customCategories = useCustomCategories();
  const customCategoryRefreshKey = customCategories.map((category) => category.id).join("|");
  const allCategories = useMemo(() => {
    const categories = getAllCategories();
    return customCategoryRefreshKey ? categories : categories;
  }, [customCategoryRefreshKey]);
  function closePicker() {
    setPickerMode(null);
    setPickerQuery("");
    setActivePickerGroupId(null);
  }

  // Service info form (modal). editCategory = "" → closed.
  const [editCategory, setEditCategory] = useState<string>("");
  const [editOriginalCategory, setEditOriginalCategory] = useState<string>("");
  const [form, setForm] = useState<ServiceFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingNewCategory, setPendingNewCategory] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const serviceImageInputRef = useRef<HTMLInputElement>(null);
  const categoryFieldRef = useRef<HTMLDivElement>(null);
  const priceFieldRef = useRef<HTMLDivElement>(null);
  const experienceFieldRef = useRef<HTMLDivElement>(null);

  function reportFormError(message: string, field?: RefObject<HTMLDivElement | null>) {
    setFormError(message);
    if (!field) return;
    requestAnimationFrame(() => {
      field.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      field.current
        ?.querySelector<HTMLElement>("input:not(:disabled), button:not(:disabled), textarea:not(:disabled)")
        ?.focus({ preventScroll: true });
    });
  }

  // App-wide autosave: report status to the section title row (inline, no layout shift).
  useReportSaveStatus(saving, saved, dirty);

  const primary = professions[0];

  function effectiveCategory(s: ProService): string {
    return s.category ?? primary ?? "";
  }

  // The single INFO object for a service (the first match; legacy multiples are
  // consolidated into one the next time the pro saves that service).
  function serviceInfo(prof: string): ProService | undefined {
    return services.find((s) => effectiveCategory(s) === prof);
  }
  // A service is active unless ALL of its info rows are explicitly inactive.
  function serviceActive(prof: string): boolean {
    const items = services.filter((s) => effectiveCategory(s) === prof);
    return items.length === 0 ? true : items.some((s) => s.active !== false);
  }

  function effectiveCategoryForState(service: ProService, fallbackPrimary: string | undefined): string {
    return service.category ?? fallbackPrimary ?? "";
  }

  function activeServiceCountForState(nextProfessions: string[], nextServices: ProService[]): number {
    const fallbackPrimary = nextProfessions[0];
    return nextProfessions.filter((prof) => {
      const items = nextServices.filter((service) => effectiveCategoryForState(service, fallbackPrimary) === prof);
      return items.length === 0 ? true : items.some((service) => service.active !== false);
    }).length;
  }

  function ensureAtLeastOneActiveService(nextProfessions: string[], nextServices: ProService[]): boolean {
    if (activeServiceCountForState(nextProfessions, nextServices) > 0) return true;
    setSaved(false);
    setFormError("Debe mantener al menos un servicio activo.");
    return false;
  }

  async function persist(
    nextProfessions: string[],
    nextServices: ProService[],
    options: { intent?: "section" | "internal" } = {},
  ): Promise<boolean> {
    if (!ensureAtLeastOneActiveService(nextProfessions, nextServices)) return false;
    setFormError(null);
    setSaving(true);
    const supabase = createClient();
    const supportsVideoConsult = anyVideoConsultCategory(nextProfessions);
    const update: Record<string, unknown> = {
      professions: nextProfessions,
      category_id: nextProfessions[0] ?? null,
      services: nextServices,
    };
    if (!supportsVideoConsult) {
      update.videoconsulta = false;
      update.coverage_areas = [];
      update.coverage_provincias = [];
      update.coverage_country = false;
    }
    try {
      const { error } = await supabase
        .from("professionals")
        .update(update)
        .eq("id", professionalId);
      if (error) throw error;

      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 3000);
      onSaved?.(options.intent ?? "section");
      return true;
    } catch (error) {
      console.error("[services-editor] service save failed", error);
      setSaved(false);
      setFormError(locale === "en"
        ? "Could not save the service changes. Try again."
        : "No se pudieron guardar los cambios del servicio. Intenta de nuevo.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Add a service from the catalog picker → then go STRAIGHT to editing its information
  // (price/description/años), so the pro is never left on an "what now?" state.
  function addService(id: string) {
    if (!id || professions.includes(id)) return;
    closePicker();
    setPendingNewCategory(id);
    openEditInfo(id);
  }

  function changeEditingService(id: string) {
    if (!id) return;
    if (id !== editOriginalCategory && professions.includes(id)) {
      reportFormError(t("alreadyAdded"), categoryFieldRef);
      closePicker();
      return;
    }
    const suggestedCredential = professionalCredentialSuggestion(id, locale);
    setForm((current) => ({
      ...current,
      professionalCredentialLabel: suggestedCredential?.label ?? "",
      professionalCredentialNumber: "",
      professionalCredentialIssuer: suggestedCredential?.issuer ?? "",
    }));
    setEditCategory(id);
    setFormError(null);
    closePicker();
  }

  // Make a service the PRINCIPAL one (index 0 = principal everywhere — drives card price).
  function makePrincipal(id: string) {
    if (professions[0] === id) return;
    const next = [id, ...professions.filter((p) => p !== id)];
    setProfessions(next);
    setSaved(false);
    setDirty(true);
  }

  // Remove a service entirely (the category + its info), while keeping at least one active service.
  function removeService(id: string) {
    const next = professions.filter((p) => p !== id);
    const nextServices = services.filter((s) => effectiveCategory(s) !== id);
    if (!ensureAtLeastOneActiveService(next, nextServices)) return;
    setProfessions(next);
    setServices(nextServices);
    setSaved(false);
    setDirty(true);
  }

  // Toggle a service active/inactive (inactive = paused, hidden from clients). Stored on
  // the service's info — created on the fly when the service has no info object yet.
  function toggleServiceActive(prof: string) {
    const items = services.filter((s) => effectiveCategory(s) === prof);
    const nextActive = !serviceActive(prof);
    let next: ProService[];
    if (items.length === 0) {
      next = [...services, { id: genId(), name: getCategoryLabel(prof, locale), category: prof, active: nextActive }];
    } else {
      next = services.map((s) => (effectiveCategory(s) === prof ? { ...s, active: nextActive } : s));
    }
    if (!ensureAtLeastOneActiveService(professions, next)) return;
    setServices(next);
    setSaved(false);
    setDirty(true);
  }

  // Open the info editor for a service, pre-filled from its current info.
  function openEditInfo(prof: string) {
    const rep = serviceInfo(prof);
    const isAsk = rep?.priceType === "a_convenir";
    const suggestedCredential = professionalCredentialSuggestion(prof, locale);
    setForm({
      description: rep?.description ?? "",
      priceUnit: rep?.priceType && !isAsk ? rep.priceType : "por_hora",
      priceAmount: rep?.priceAmount != null ? String(rep.priceAmount) : "",
      aConsultar: isAsk,
      startedAt: rep?.startedAt ?? monthValueFromExperience(rep?.years, rep?.months),
      imageUrl: rep?.imageUrl ?? "",
      professionalCredentialLabel: rep?.professionalCredentialLabel ?? suggestedCredential?.label ?? "",
      professionalCredentialNumber: rep?.professionalCredentialNumber ?? "",
      professionalCredentialIssuer: rep?.professionalCredentialIssuer ?? suggestedCredential?.issuer ?? "",
    });
    setFormError(null);
    if (professions.includes(prof)) setPendingNewCategory(null);
    setEditOriginalCategory(prof);
    setEditCategory(prof);
  }

  function serviceMissingTarget(field: string | null | undefined): string | null {
    const activeProfessions = professions.filter((prof) => serviceActive(prof));
    const candidates = activeProfessions.length > 0 ? activeProfessions : professions;
    if (field === "services") return professions[0] ?? null;
    if (field === "serviceDescription") {
      return candidates.find((prof) => !serviceInfo(prof)?.description?.trim()) ?? candidates[0] ?? null;
    }
    if (field === "servicePrice") {
      return candidates.find((prof) => {
        const info = serviceInfo(prof);
        return !(
          info?.priceType === "a_convenir" ||
          (typeof info?.priceAmount === "number" && info.priceAmount > 0) ||
          !!info?.price?.trim()
        );
      }) ?? candidates[0] ?? null;
    }
    if (field === "serviceExperience") {
      return candidates.find((prof) => {
        const info = serviceInfo(prof);
        return !(
          (typeof info?.startedAt === "string" && /^\d{4}-\d{2}$/.test(info.startedAt)) ||
          (typeof info?.years === "number" && info.years > 0) ||
          (typeof info?.months === "number" && info.months > 0)
        );
      }) ?? candidates[0] ?? null;
    }
    if (field === "serviceImage") {
      return candidates.find((prof) => !serviceInfo(prof)?.imageUrl?.trim()) ?? candidates[0] ?? null;
    }
    if (field === "serviceCredential") {
      return candidates.find((prof) => !serviceInfo(prof)?.professionalCredentialNumber?.trim()) ?? candidates[0] ?? null;
    }
    return professions.find((prof) => !serviceInfo(prof)) ?? professions[0] ?? null;
  }

  useEffect(() => {
    if (focusField === "services" && focusKey) {
      setPickerMode("add");
      setPickerQuery("");
      setActivePickerGroupId(null);
      return;
    }
    if (!focusField?.startsWith("service") || !focusKey) return;
    const target = serviceMissingTarget(focusField);
    if (target) openEditInfo(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusField, focusKey]);

  function cancelForm() {
    setEditCategory("");
    setEditOriginalCategory("");
    setForm(EMPTY_FORM);
    setFormError(null);
    setPendingNewCategory(null);
  }

  const formOpen = editCategory !== "";

  async function handleServiceImageSelect(file: File) {
    setImageUploading(true);
    setFormError(null);
    try {
      const preparedFile = await prepareImageForUpload(file, { maxDimension: 1400 });
      const fd = new FormData();
      fd.append("file", preparedFile);
      fd.append("type", "portfolio");
      const upload = await uploadPhotoFormDataWithRetry(fd);
      const uploadedUrl = upload.data.url;
      if (!upload.ok || !uploadedUrl) throw new Error(upload.data.error || "No se pudo subir la imagen.");
      setForm((current) => ({ ...current, imageUrl: uploadedUrl }));
    } catch (error) {
      console.error("[services-editor] service image upload failed", error);
      const code = getImageUploadPreparationErrorCode(error);
      setFormError(code === "too_large"
        ? (locale === "en" ? "That photo is too large. Choose a lighter photo or take a new one." : "La foto es muy pesada. Elige una foto más liviana o toma una nueva.")
        : code === "unsupported"
          ? (locale === "en" ? "Use a JPG, PNG, WEBP, AVIF, HEIC, HEIF, or GIF image." : "Usa una imagen JPG, PNG, WEBP, AVIF, HEIC, HEIF o GIF.")
          : (locale === "en" ? "Could not upload the service image. Try again." : "No se pudo subir la imagen del servicio. Intenta de nuevo."));
    } finally {
      setImageUploading(false);
    }
  }

  async function handleFormSave() {
    // Require an explicit price OR the deliberate "Consultar precio" choice.
    if (!form.aConsultar && !form.priceAmount.trim()) {
      reportFormError(t("priceRequired"), priceFieldRef);
      return;
    }
    setFormError(null);

    const originalCategory = editOriginalCategory || editCategory;
    if (editCategory !== originalCategory && professions.includes(editCategory)) {
      reportFormError(t("alreadyAdded"), categoryFieldRef);
      return;
    }

    const priceType: PricingType = form.aConsultar ? "a_convenir" : form.priceUnit;
    const amount = form.aConsultar
      ? undefined
      : parseMoneyAmount(form.priceAmount) ?? undefined;
    const priceDisplay = formatServicePrice(amount, priceType) ?? undefined;
    const description = form.description.trim().slice(0, SERVICE_DESCRIPTION_MAX_LENGTH);
    const experience = experienceFromMonthValue(form.startedAt);
    if (!experience || (experience.years <= 0 && experience.months <= 0)) {
      reportFormError(t("experienceRequired"), experienceFieldRef);
      return;
    }

    // Consolidate this service's category to exactly ONE info object — preserving the
    // existing id (caso de éxito linkage) and active state. The display name comes
    // from the current catalog so old saved labels stay consistent across the app.
    const rep = serviceInfo(originalCategory) ?? serviceInfo(editCategory);
    const info: ProService = {
      id: rep?.id ?? genId(),
      name: getCategoryLabel(editCategory, locale),
      description: description || undefined,
      priceAmount: amount,
      priceType,
      price: priceDisplay,
      years: experience.years,
      months: experience.months,
      startedAt: form.startedAt,
      imageUrl: form.imageUrl || undefined,
      professionalCredentialLabel: serviceSupportsProfessionalCredential(editCategory)
        ? trimCredential(form.professionalCredentialLabel) || undefined
        : undefined,
      professionalCredentialNumber: serviceSupportsProfessionalCredential(editCategory)
        ? trimCredential(form.professionalCredentialNumber) || undefined
        : undefined,
      professionalCredentialIssuer: serviceSupportsProfessionalCredential(editCategory)
        ? trimCredential(form.professionalCredentialIssuer) || undefined
        : undefined,
      category: editCategory,
      active: rep?.active ?? true,
    };
    const nextProfessions = pendingNewCategory === originalCategory && !professions.includes(originalCategory)
      ? [...professions, editCategory]
      : professions.map((prof) => (prof === originalCategory ? editCategory : prof));
    const next = [
      ...services.filter((s) => {
        const category = effectiveCategory(s);
        return category !== originalCategory && category !== editCategory;
      }),
      info,
    ];
    const didSave = await persist(nextProfessions, next, { intent: "internal" });
    if (!didSave) return;
    setProfessions(nextProfessions);
    setServices(next);
    setPendingNewCategory(null);
    setEditOriginalCategory(editCategory);
    setEditCategory("");
    setForm(EMPTY_FORM);
  }

  // Services available to add (taxonomy minus the ones already added), filtered by the
  // picker's search (label + keywords, accent-insensitive).
  const pickerList = useMemo(() => {
    const base = allCategories.filter((c) => pickerMode === "change"
      ? c.id === editCategory || !professions.includes(c.id)
      : !professions.includes(c.id));
    const q = normalizeText(pickerQuery.trim());
    if (!q) return base;
    return base.filter(
      (c) => normalizeText(getCategoryLabel(c.id, locale)).includes(q) || c.keywords.some((k) => normalizeText(k).includes(q))
    );
  }, [allCategories, editCategory, pickerMode, pickerQuery, professions, locale]);

  // Group the picker list by category GROUP (Hogar, Salud, Belleza…) with section headers.
  const pickerGroups = useMemo<CategoryPickerGroup[]>(() => {
    const groups: CategoryPickerGroup[] = [];
    for (const cat of pickerList) {
      const last = groups[groups.length - 1];
      if (last && last.id === cat.groupId) last.items.push(cat);
      else groups.push({ id: cat.groupId, items: [cat] });
    }
    return groups;
  }, [pickerList]);

  // ── The elegant, single list-level "Agregar servicio" action (opens the catalog). ──
  function cancelListChanges() {
    setProfessions(seedProfessions);
    setServices(initialServices);
    setDirty(false);
    setSaved(false);
    setFormError(null);
  }

  const listActions = (
    <div className="flex flex-col gap-2 border-t border-[#f3f4f6] pt-4 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={cancelListChanges}
        disabled={!dirty || saving || imageUploading}
        className="hidden h-10 rounded-xl px-4 text-sm font-semibold text-[#374151] transition-colors hover:bg-[#f3f4f6] disabled:cursor-not-allowed disabled:opacity-45 sm:inline-flex sm:items-center sm:justify-center"
      >
        {t("cancel")}
      </button>
      <button
        type="button"
        onClick={() => void persist(professions, services)}
        disabled={!dirty || saving || imageUploading}
        className="h-10 w-full rounded-xl bg-[#009FD9] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0089bb] disabled:cursor-not-allowed disabled:bg-[#cbd5e1] disabled:text-white sm:w-auto"
      >
        {saving ? t("saving") : t("saveChanges")}
      </button>
    </div>
  );
  const addServiceButton = (
    <button
      type="button"
      onClick={() => { setPickerMode("add"); setPickerQuery(""); setActivePickerGroupId(null); }}
      className="group flex w-full max-w-full items-center justify-center gap-2.5 rounded-2xl border border-[#bfdbfe] bg-[#f8fbfe] py-4 text-sm font-bold text-[#0089bb] shadow-sm transition-all hover:border-[#009FD9] hover:bg-[#EBF5FB] hover:shadow"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#009FD9] text-white shadow-sm transition-transform group-hover:scale-105">
        <Plus className="h-4 w-4" strokeWidth={2.5} />
      </span>
      {t("addProfession")}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      {formError && !formOpen ? (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
      ) : null}

      {professions.length === 0 ? (
        /* No services yet → a calm, actionable empty state. */
        <div className="ccr-empty-state flex min-h-[20rem] flex-col items-center justify-center px-4 py-12 text-center sm:min-h-[22rem] sm:px-6">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#EBF5FB]">
            <Plus className="h-6 w-6 text-[#009FD9]" />
          </span>
          <p className="text-[15px] font-bold text-[#162543]">{t("emptyTitle")}</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-[#6b7280]">{t("emptyHelp")}</p>
          <div className="mx-auto mt-5 max-w-xs">{addServiceButton}</div>
        </div>
      ) : (
        <>
          {/* ONE service per card: name + price (focal), description, then clearly grouped
              actions. No catalog image in the panel (it's for the public profile only). */}
          <div className="grid min-w-0 grid-cols-1 gap-3.5">
            {professions.map((prof) => {
              const isPrincipal = professions.indexOf(prof) === 0;
              const info = serviceInfo(prof);
              const isActive = serviceActive(prof);
              const priceLabel = info?.priceType === "a_convenir"
                ? t("priceConsult")
                : formatServicePrice(info?.priceAmount, info?.priceType, locale) ?? info?.price ?? t("priceConsult");
              const priceParts = splitPricingLabel(priceLabel);
              return (
                <section
                  key={prof}
                  className={cn(
                    "flex min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition-shadow sm:p-5",
                    isActive ? "border-[#e5e7eb] hover:shadow-md" : "border-[#e5e7eb] bg-[#fafbfc]"
                  )}
                >
                  {/* Header: focal name + price on the left, active toggle pinned far right. */}
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 overflow-hidden">
                    <div className="min-w-0 overflow-hidden">
                      <h3 className={cn("text-[16px] font-bold leading-tight [overflow-wrap:anywhere]", isActive ? "text-[#162543]" : "text-[#9ca3af]")}>
                        {getCategoryLabel(prof, locale)}
                      </h3>
                      <p className={cn("mt-1.5 text-[13px] font-semibold", isActive ? "text-[#0089bb]" : "text-[#9ca3af]")}>
                        {priceParts.amount}
                        {priceParts.unit && <span className="text-[#6b7280]"> {priceParts.unit}</span>}
                        {priceParts.taxSuffix && <span className="ml-1 text-[10px] tracking-wide text-[#9ca3af]">{priceParts.taxSuffix}</span>}
                      </p>
                    </div>
                    {/* Active/inactive toggle — FAR RIGHT (end of the header row). */}
                    <button
                      type="button"
                      onClick={() => toggleServiceActive(prof)}
                      aria-label={isActive ? t("hideService") : t("publishService")}
                      aria-pressed={isActive}
                      className="inline-flex shrink-0 items-center gap-2 rounded-md px-1 py-0.5 text-xs font-bold text-[#526277] transition-colors hover:text-[#162543] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9] focus-visible:ring-offset-2"
                    >
                      <ServiceActiveToggle checked={isActive} />
                    </button>
                  </div>

                  {/* Description group — calm supporting text (or a gentle prompt). */}
                  {info?.description ? (
                    <p className="mt-3 text-[13px] leading-relaxed text-[#6b7280] [overflow-wrap:anywhere]">{info.description}</p>
                  ) : (
                    <p className="mt-3 text-[13px] italic leading-relaxed text-[#9ca3af]">{t("noDescriptionYet")}</p>
                  )}
                  <div className="mt-3 min-h-[18px]">
                    {isPrincipal ? (
                      <span className="text-xs font-bold text-[#0089bb]">{t("principal")}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => makePrincipal(prof)}
                        className="text-left text-xs font-bold text-[#0089bb] underline-offset-4 transition-colors hover:text-[#0077a3] hover:underline"
                      >
                        {t("makePrincipal")}
                      </button>
                    )}
                  </div>

                  {/* Actions group — separated by a hairline. The PRIMARY "Editar información"
                      is isolated on the left so it's identical on every card; secondary actions
                      stay in the right cluster. */}
                  <div className="mt-4 flex items-center gap-1.5 border-t border-[#f3f4f6] pt-3">
                    <button
                      type="button"
                      onClick={() => openEditInfo(prof)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-[#0089bb] transition-colors hover:bg-[#EBF5FB]"
                    >
                      <Pencil className="h-3.5 w-3.5" /> {t("editInfo")}
                    </button>
                    <div className="ml-auto flex items-center gap-0.5">
                      <AppTooltip label={t("removeProfession")}>
                        <button
                          type="button"
                          onClick={() => removeService(prof)}
                          aria-label={t("removeProfession")}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#9ca3af] transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </AppTooltip>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>

          {/* The single, elegant list-level add action. */}
          {addServiceButton}
          {listActions}
        </>
      )}

      {/* ── Edit a service's information ──────────────────────────────── */}
      {formOpen && (
        <Modal
          onClose={cancelForm}
          title={getCategoryLabel(editCategory, locale)}
          subtitle={t("editInfo")}
          closeLabel={t("cancel")}
          footerNotice={formError ? (
            <div
              role="alert"
              aria-live="assertive"
              data-testid="service-form-error"
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold leading-5 text-red-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          ) : undefined}
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={cancelForm}
                disabled={saving || imageUploading}
                className="min-w-0 flex-1 select-none sm:flex-none"
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleFormSave}
                loading={saving}
                disabled={saving || imageUploading}
                data-testid="service-edit-save"
                className="min-w-0 flex-1 select-none sm:min-w-[10.5rem] sm:flex-none"
              >
                {saving
                  ? t("saving")
                  : imageUploading
                    ? (locale === "en" ? "Uploading image…" : "Subiendo imagen…")
                    : t("saveChanges")}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div ref={categoryFieldRef}>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">{t("serviceLabel")}</label>
              <CategorySearch
                value={editCategory}
                onChange={changeEditingService}
                placeholder={t("pickerSearch")}
                clearable={false}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">
                {t("descBrief")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
              </label>
              <textarea
                className="min-h-[150px] w-full resize-y rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                placeholder={t("offerDescPlaceholder")}
                value={form.description}
                maxLength={SERVICE_DESCRIPTION_MAX_LENGTH}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value.slice(0, SERVICE_DESCRIPTION_MAX_LENGTH) }))}
              />
              <p className="mt-1.5 text-right text-xs text-[#6b7280]">
                {t("descriptionLimit", { count: form.description.length, max: SERVICE_DESCRIPTION_MAX_LENGTH })}
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">
                {locale === "en" ? "Service image" : "Imagen de tu servicio"} <span className="font-normal text-[#9ca3af]">{t("optional")}</span>
              </label>
              <div className="overflow-hidden rounded-2xl border border-[#dbe7ef] bg-[#f8fbfe]">
                {form.imageUrl ? (
                  <div className="relative h-36 bg-[#eef1f5] sm:h-44">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.imageUrl} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, imageUrl: "" }))}
                      className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-[#162543] shadow-sm transition-colors hover:bg-red-50 hover:text-red-600"
                      aria-label={locale === "en" ? "Remove service image" : "Eliminar imagen del servicio"}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => serviceImageInputRef.current?.click()}
                    disabled={imageUploading}
                    className="flex min-h-32 w-full flex-col items-center justify-center gap-2 px-4 py-6 text-center transition-colors hover:bg-[#eef9fd] disabled:cursor-wait"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-[#EBF5FB] text-[#009FD9]">
                      {imageUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                    </span>
                    <span className="text-sm font-extrabold text-[#0089bb]">
                      {locale === "en" ? "Add service image" : "Agregar imagen"}
                    </span>
                    <span className="max-w-xs text-xs leading-relaxed text-[#64748b]">
                      {locale === "en" ? "Show this service with a real photo." : "Mostrá este servicio con una foto real."}
                    </span>
                  </button>
                )}
                {form.imageUrl && (
                  <button
                    type="button"
                    onClick={() => serviceImageInputRef.current?.click()}
                    disabled={imageUploading}
                    className="flex h-11 w-full items-center justify-center gap-2 border-t border-[#dbe7ef] text-sm font-bold text-[#0089bb] transition-colors hover:bg-[#eef9fd] disabled:cursor-wait disabled:opacity-70"
                  >
                    {imageUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    {locale === "en" ? "Change image" : "Cambiar imagen"}
                  </button>
                )}
                <input
                  ref={serviceImageInputRef}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = "";
                    if (file) void handleServiceImageSelect(file);
                  }}
                />
              </div>
            </div>

            <div ref={priceFieldRef}>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">{t("priceRef")} {!form.aConsultar && <span className="text-red-500">*</span>}</label>
              <div className="flex items-stretch gap-2">
                <div className={cn("flex-1", form.aConsultar && "opacity-50 pointer-events-none")}>
                  <PriceInput
                    placeholder={t("amountPlaceholder")}
                    value={form.priceAmount}
                    onChange={(v) => {
                      setForm((f) => ({ ...f, priceAmount: v }));
                      setFormError(null);
                    }}
                    suffix={form.aConsultar ? undefined : TAX_INCLUDED_SUFFIX}
                    className="h-11"
                  />
                </div>
                <SelectMenu
                  value={form.priceUnit}
                  onChange={(value) => setForm((current) => ({ ...current, priceUnit: value as PricingType }))}
                  disabled={form.aConsultar}
                  className="w-32 shrink-0 sm:w-40"
                  options={PRICE_UNITS.map((priceType) => ({ value: priceType.value, label: priceType.suffix || priceType.label }))}
                />
              </div>
              <label className="mt-2.5 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.aConsultar}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, aConsultar: e.target.checked }));
                    setFormError(null);
                  }}
                  className="h-5 w-5 rounded-[4px] border-[#b8c5d3] bg-white text-[#009FD9] focus:ring-[#009FD9]"
                />
                <span className="text-sm text-[#374151]">{t("aConsultarLabel")}</span>
              </label>
            </div>

            <div ref={experienceFieldRef}>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">
                {t("experienceLabel")} <span className="text-red-500">*</span>
              </label>
              <ServiceStartMonthPicker
                value={form.startedAt}
                locale={locale}
                onChange={(startedAt) => {
                  setForm((f) => ({ ...f, startedAt }));
                  setFormError(null);
                }}
              />
            </div>

            {professionalCredentialSuggestion(editCategory, locale) && (
              <div className="space-y-3">
                <div className="flex items-start gap-2.5">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#009FD9]" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-[#374151]">
                      {locale === "en" ? "Professional credential" : "Credencial profesional"}
                      <span className="ml-1 font-normal text-[#9ca3af]">{t("optional")}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-[#64748b]">
                      {locale === "en"
                        ? "Helps clients verify your professional authorization."
                        : "Ayuda a los clientes a verificar tu autorización profesional."}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-[#526277]">
                    {form.professionalCredentialLabel || (locale === "en" ? "Credential number" : "Número de credencial")}
                    <input
                      value={form.professionalCredentialNumber}
                      maxLength={PROFESSIONAL_CREDENTIAL_MAX_LENGTH}
                      onChange={(event) => setForm((current) => ({ ...current, professionalCredentialNumber: event.target.value }))}
                      placeholder={locale === "en" ? "Enter the number" : "Ingresa el número"}
                      className="mt-1.5 h-11 w-full rounded-xl border border-[#dbe7ef] bg-white px-3 text-sm text-[#162543] outline-none transition-colors focus:border-[#009FD9]"
                    />
                  </label>
                  <label className="text-xs font-medium text-[#526277]">
                    {locale === "en" ? "Issuing organization" : "Entidad emisora"}
                    <input
                      value={form.professionalCredentialIssuer}
                      maxLength={PROFESSIONAL_CREDENTIAL_MAX_LENGTH}
                      onChange={(event) => setForm((current) => ({ ...current, professionalCredentialIssuer: event.target.value }))}
                      placeholder={locale === "en" ? "Professional association" : "Colegio o entidad"}
                      className="mt-1.5 h-11 w-full rounded-xl border border-[#dbe7ef] bg-white px-3 text-sm text-[#162543] outline-none transition-colors focus:border-[#009FD9]"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── Service picker (same catalog for add + change) ─────────────── */}
      {pickerMode && (
        <Modal
          onClose={closePicker}
          title={pickerMode === "change" ? t("changeServiceTitle") : t("pickerTitle")}
          closeLabel={t("cancel")}
          bodyClassName="flex flex-col overflow-hidden px-0 py-0"
        >
          <div data-testid="services-add-picker" className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 bg-white px-5 pb-3 pt-4 sm:px-6">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
                <input
                  value={pickerQuery}
                  onChange={(e) => { setPickerQuery(e.target.value); setActivePickerGroupId(null); }}
                  placeholder={t("pickerSearch")}
                  className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white pl-9 pr-4 text-sm text-[#111827] transition-all placeholder:text-[#9ca3af] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
                />
              </div>
            </div>
            <div data-testid="services-add-picker-scroll" className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 sm:px-4",
              pickerList.length === 0 && pickerQuery.trim() ? "pt-0" : "pt-2"
            )}>
              {pickerList.length === 0 && pickerQuery.trim() ? (
                null
              ) : pickerQuery.trim() ? (
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {pickerList.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => pickerMode === "change" ? changeEditingService(cat.id) : addService(cat.id)}
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
                  activeGroupId={activePickerGroupId}
                  onActiveGroupChange={setActivePickerGroupId}
                  onSelect={(id) => pickerMode === "change" ? changeEditingService(id) : addService(id)}
                  backLabel={t("pickerBack")}
                  countLabel={(count) => t("pickerOptionsCount", { count })}
                  optionAction={<Plus className="h-4 w-4 shrink-0 text-[#009FD9]" />}
                  className="gap-1"
                  groupClassName="rounded-xl border border-[#e5e7eb] bg-white py-2 hover:border-[#009FD9] hover:bg-[#f8fbfe]"
                  optionClassName="rounded-xl border border-[#e5e7eb] bg-white hover:border-[#009FD9] hover:bg-[#f8fbfe]"
                />
              )}

              <div className={cn("text-center", pickerList.length === 0 && pickerQuery.trim() ? "mt-1" : "mt-4")}>
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
                  defaultName={pickerQuery}
                />
              </div>
            </div>
          </div>
        </Modal>
      )}
      <UnsavedChangesGuard dirty={dirty} onSave={() => persist(professions, services)} onDiscard={cancelListChanges} />
    </div>
  );
}
