"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Trash2, Pencil, Search, MapPin, Home, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PriceInput } from "@/components/ui/price-input";
import { Modal } from "@/components/ui/modal";
import { CategorySuggestionBox } from "@/components/ui/category-suggestion";
import { CategoryGroupPicker, type CategoryPickerGroup } from "@/components/ui/category-group-picker";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { getCategoryLabel, getAllCategories, normalizeText } from "@/lib/data/categories";
import { useCustomCategories } from "@/lib/data/use-custom-categories";
import { PRICING_TYPES, formatServicePrice, type PricingType } from "@/lib/pricing";
import { useReportSaveStatus } from "@/components/dashboard/save-status-context";

export type ServiceModality = "in_person" | "at_home" | "video";

export type ProService = {
  id: string;
  name: string;
  description?: string;
  price?: string;          // display string (kept in sync from amount+type)
  priceAmount?: number;    // colones (optional)
  priceType?: PricingType; // por_hora | por_proyecto | …
  years?: number;          // years of experience in THIS service (optional)
  // Which service (category id) this info belongs to. The model is SERVICES-ONLY:
  // each service the pro offers = one catalog category, with ONE info object.
  category?: string;
  // Active/inactive toggle (sprint 486). An INACTIVE service is "paused" — kept in the
  // editor but HIDDEN from clients (public profile). Undefined/true = active (back-compat).
  active?: boolean;
  // How this specific service can be delivered. Availability stays shared; these are
  // client-facing modalities, not separate schedule locations.
  modalities?: ServiceModality[];
};

interface ServicesEditorProps {
  professionalId: string;
  primaryCategory?: string;
  initialProfessions?: string[];
  initialServices?: ProService[];
  onSaved?: () => void;
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
  years: string;
  modalities: ServiceModality[];
}

const EMPTY_FORM: ServiceFormState = { description: "", priceUnit: "por_hora", priceAmount: "", aConsultar: false, years: "", modalities: ["in_person"] };
const MODALITY_OPTIONS: ServiceModality[] = ["in_person", "at_home", "video"];
const MODALITY_ICON = {
  in_person: MapPin,
  at_home: Home,
  video: Video,
} satisfies Record<ServiceModality, typeof MapPin>;

export function ServicesEditor({
  professionalId,
  primaryCategory,
  initialProfessions = [],
  initialServices = [],
  onSaved,
}: ServicesEditorProps) {
  const locale = useLocale();
  const t = useTranslations("servicesEditor");
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

  // Add-service picker (modal)
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [activePickerGroupId, setActivePickerGroupId] = useState<string | null>(null);
  // Admin-approved custom categories — selectable as services too.
  const customCategories = useCustomCategories();
  function closePicker() {
    setShowPicker(false);
    setPickerQuery("");
    setActivePickerGroupId(null);
  }

  // Service info form (modal). editCategory = "" → closed.
  const [editCategory, setEditCategory] = useState<string>("");
  const [form, setForm] = useState<ServiceFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingNewCategory, setPendingNewCategory] = useState<string | null>(null);

  // App-wide autosave: report status to the section title row (inline, no layout shift).
  useReportSaveStatus(saving, saved);

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

  async function persist(nextProfessions: string[], nextServices: ProService[]) {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("professionals")
      .update({
        professions: nextProfessions,
        category_id: nextProfessions[0] ?? null,
        services: nextServices,
      })
      .eq("id", professionalId);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    onSaved?.();
  }

  // Add a service from the catalog picker → then go STRAIGHT to editing its information
  // (price/description/años), so the pro is never left on an "what now?" state.
  function addService(id: string) {
    if (!id || professions.includes(id)) return;
    closePicker();
    setPendingNewCategory(id);
    openEditInfo(id);
  }

  // Make a service the PRINCIPAL one (index 0 = principal everywhere — drives card price).
  function makePrincipal(id: string) {
    if (professions[0] === id) return;
    const next = [id, ...professions.filter((p) => p !== id)];
    setProfessions(next);
    persist(next, services);
  }

  // Remove a service entirely (the category + its info). Keep at least one service.
  function removeService(id: string) {
    if (professions.length <= 1) return;
    const next = professions.filter((p) => p !== id);
    const nextServices = services.filter((s) => effectiveCategory(s) !== id);
    setProfessions(next);
    setServices(nextServices);
    persist(next, nextServices);
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
    setServices(next);
    persist(professions, next);
  }

  // Open the info editor for a service, pre-filled from its current info.
  function openEditInfo(prof: string) {
    const rep = serviceInfo(prof);
    const isAsk = rep?.priceType === "a_convenir";
    setForm({
      description: rep?.description ?? "",
      priceUnit: rep?.priceType && !isAsk ? rep.priceType : "por_hora",
      priceAmount: rep?.priceAmount != null ? String(rep.priceAmount) : "",
      aConsultar: isAsk,
      years: rep?.years != null ? String(rep.years) : "",
      modalities: rep?.modalities?.length ? rep.modalities : ["in_person"],
    });
    setFormError(null);
    if (professions.includes(prof)) setPendingNewCategory(null);
    setEditCategory(prof);
  }

  function cancelForm() {
    setEditCategory("");
    setForm(EMPTY_FORM);
    setFormError(null);
    setPendingNewCategory(null);
  }

  const formOpen = editCategory !== "";

  async function handleFormSave() {
    // Require an explicit price OR the deliberate "Consultar precio" choice.
    if (!form.aConsultar && !form.priceAmount.trim()) {
      setFormError(t("priceRequired"));
      return;
    }
    setFormError(null);

    const priceType: PricingType = form.aConsultar ? "a_convenir" : form.priceUnit;
    const amount = form.aConsultar
      ? undefined
      : form.priceAmount.trim() ? Number(form.priceAmount.replace(/\D/g, "")) : undefined;
    const priceDisplay = formatServicePrice(amount, priceType) ?? undefined;
    const years = form.years.trim() ? Number(form.years.replace(/\D/g, "")) : undefined;

    // Consolidate this service's category to exactly ONE info object — preserving the
    // existing id (caso de éxito linkage), display name and active state.
    const rep = serviceInfo(editCategory);
    const info: ProService = {
      id: rep?.id ?? genId(),
      name: rep?.name?.trim() || getCategoryLabel(editCategory, locale),
      description: form.description.trim() || undefined,
      priceAmount: amount,
      priceType,
      price: priceDisplay,
      years,
      category: editCategory,
      active: rep?.active ?? true,
      modalities: form.modalities.length > 0 ? form.modalities : ["in_person"],
    };
    const nextProfessions = pendingNewCategory === editCategory && !professions.includes(editCategory)
      ? [...professions, editCategory]
      : professions;
    const next = [...services.filter((s) => effectiveCategory(s) !== editCategory), info];
    setProfessions(nextProfessions);
    setServices(next);
    cancelForm();
    await persist(nextProfessions, next);
  }

  // Services available to add (taxonomy minus the ones already added), filtered by the
  // picker's search (label + keywords, accent-insensitive).
  const pickerList = useMemo(() => {
    const base = getAllCategories().filter((c) => !professions.includes(c.id));
    const q = normalizeText(pickerQuery.trim());
    if (!q) return base;
    return base.filter(
      (c) => normalizeText(getCategoryLabel(c.id, locale)).includes(q) || c.keywords.some((k) => normalizeText(k).includes(q))
    );
    // customCategories in deps so the list refreshes once approved customs load.
  }, [pickerQuery, professions, locale, customCategories]);

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

  const inputClass =
    "w-full h-11 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

  // ── The elegant, single list-level "Agregar servicio" action (opens the catalog). ──
  const addServiceButton = (
    <button
      type="button"
      onClick={() => { setShowPicker(true); setPickerQuery(""); setActivePickerGroupId(null); }}
      className="group flex w-full items-center justify-center gap-2.5 rounded-2xl border border-[#bfdbfe] bg-[#f8fbfe] py-4 text-sm font-bold text-[#0089bb] shadow-sm transition-all hover:border-[#009FD9] hover:bg-[#EBF5FB] hover:shadow"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#009FD9] text-white shadow-sm transition-transform group-hover:scale-105">
        <Plus className="h-4 w-4" strokeWidth={2.5} />
      </span>
      {t("addProfession")}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      {professions.length === 0 ? (
        /* No services yet → a calm, actionable empty state. */
        <div className="rounded-2xl border border-dashed border-[#dbe3ea] bg-[#fbfcfe] px-6 py-10 text-center">
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
          <div className="grid grid-cols-1 gap-3.5">
            {professions.map((prof) => {
              const isPrincipal = professions.indexOf(prof) === 0;
              const info = serviceInfo(prof);
              const isActive = serviceActive(prof);
              const priceLabel = info?.price && info.priceType !== "a_convenir" ? info.price : t("priceConsult");
              const modalities = info?.modalities?.length ? info.modalities : ["in_person"];
              return (
                <section
                  key={prof}
                  className={cn(
                    "flex flex-col rounded-2xl border bg-white p-4 shadow-sm transition-shadow sm:p-5",
                    isActive ? "border-[#e5e7eb] hover:shadow-md" : "border-[#e5e7eb] bg-[#fafbfc]"
                  )}
                >
                  {/* Header: focal name + price on the left, active toggle pinned far right. */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className={cn("text-[16px] font-bold leading-tight [overflow-wrap:anywhere]", isActive ? "text-[#162543]" : "text-[#9ca3af]")}>
                        {getCategoryLabel(prof, locale)}
                      </h3>
                      <p className={cn("mt-1.5 text-[13px] font-semibold", isActive ? "text-[#0089bb]" : "text-[#9ca3af]")}>{priceLabel}</p>
                    </div>
                    {/* Active/inactive toggle — FAR RIGHT (end of the header row). */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isActive}
                      onClick={() => toggleServiceActive(prof)}
                      className="flex shrink-0 items-center gap-1.5"
                      title={isActive ? t("svcActive") : t("svcInactive")}
                      aria-label={isActive ? t("svcActive") : t("svcInactive")}
                    >
                      <span className={cn("relative h-4 w-7 rounded-full transition-colors", isActive ? "bg-[#009FD9]" : "bg-[#d1d5db]")}>
                        <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", isActive ? "left-[14px]" : "left-0.5")} />
                      </span>
                      <span className={cn("hidden text-[11px] font-semibold sm:inline", isActive ? "text-[#16a34a]" : "text-[#9ca3af]")}>
                        {isActive ? t("svcActive") : t("svcInactive")}
                      </span>
                    </button>
                  </div>

                  {/* Description group — calm supporting text (or a gentle prompt). */}
                  {info?.description ? (
                    <p className="mt-3 text-[13px] leading-relaxed text-[#6b7280] [overflow-wrap:anywhere]">{info.description}</p>
                  ) : (
                    <p className="mt-3 text-[13px] italic leading-relaxed text-[#9ca3af]">{t("noDescriptionYet")}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {modalities.map((modality) => (
                      <span key={modality} className="inline-flex rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-semibold text-[#6b7280]">
                        {t(`modality.${modality}`)}
                      </span>
                    ))}
                  </div>

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
                      {professions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeService(prof)}
                          title={t("removeProfession")}
                          aria-label={t("removeProfession")}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#9ca3af] transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>

          {/* The single, elegant list-level add action. */}
          {addServiceButton}
        </>
      )}

      {/* ── Add-service picker (image catalog) ─────────────────────────── */}
      {showPicker && (
        <Modal
          onClose={closePicker}
          title={t("pickerTitle")}
          closeLabel={t("cancel")}
          bodyClassName="px-0 py-0"
        >
          <div className="sticky top-0 z-10 border-b border-[#f3f4f6] bg-white px-5 pb-3 pt-4 sm:px-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
              <input
                value={pickerQuery}
                onChange={(e) => { setPickerQuery(e.target.value); setActivePickerGroupId(null); }}
                placeholder={t("pickerSearch")}
                autoFocus
                className="w-full h-11 rounded-xl border border-[#e5e7eb] bg-white pl-9 pr-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
              />
            </div>
          </div>
          <div className="px-3 py-2 sm:px-4">
            {pickerList.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="mb-1 text-sm font-medium text-[#374151]">{t("pickerNoResults")}</p>
                <p className="text-xs text-[#9ca3af]">{t("pickerNoResultsHint")}</p>
              </div>
            ) : pickerQuery.trim() ? (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {pickerList.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => addService(cat.id)}
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
                onSelect={addService}
                backLabel={t("pickerBack")}
                countLabel={(count) => t("pickerOptionsCount", { count })}
                optionAction={<Plus className="h-4 w-4 shrink-0 text-[#009FD9]" />}
                optionClassName="rounded-xl border border-[#e5e7eb] bg-white hover:border-[#009FD9] hover:bg-[#f8fbfe]"
              />
            )}

            {/* "¿No ves tu servicio?" — type → submit → admin reviews → becomes selectable. */}
            <CategorySuggestionBox
              className="mt-1"
              notListedLabel={t("notListed")}
              placeholder={t("suggestNamePlaceholder")}
              sendLabel={t("suggestSend")}
              sendingLabel={t("suggestSending")}
              cancelLabel={t("cancel")}
              thanksLabel={t("suggestThanks")}
            />
          </div>
        </Modal>
      )}

      {/* ── Edit a service's information ──────────────────────────────── */}
      {formOpen && (
        <Modal
          onClose={cancelForm}
          title={t("editInfo")}
          subtitle={getCategoryLabel(editCategory, locale)}
          closeLabel={t("cancel")}
          footer={
            <>
              <Button type="button" variant="outline" onClick={cancelForm}>{t("cancel")}</Button>
              <Button type="button" onClick={handleFormSave} loading={saving} disabled={saving}>
                {t("saveChanges")}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {formError && (
              <p className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">{formError}</p>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">
                {t("descBrief")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
              </label>
              <textarea
                className="min-h-[150px] w-full resize-y rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                placeholder={t("offerDescPlaceholder")}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                autoFocus
              />
            </div>

            <div>
              <p className="mb-2 block text-sm font-medium text-[#374151]">{t("modalitiesLabel")}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {MODALITY_OPTIONS.map((modality) => {
                  const checked = form.modalities.includes(modality);
                  const Icon = MODALITY_ICON[modality];
                  return (
                    <button
                      key={modality}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => setForm((f) => {
                        const next = checked
                          ? f.modalities.filter((m) => m !== modality)
                          : [...f.modalities, modality];
                        return { ...f, modalities: next.length > 0 ? next : ["in_person"] };
                      })}
                      className={cn(
                        "group flex min-h-[86px] items-start gap-3 rounded-xl border p-3 text-left transition-all",
                        checked
                          ? "border-[#009FD9] bg-[#f4fbff] shadow-sm ring-1 ring-[#bfe8f7]"
                          : "border-[#e5e7eb] bg-white hover:border-[#bfdbfe] hover:bg-[#f8fbfe]"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                          checked ? "bg-[#009FD9] text-white" : "bg-[#f3f4f6] text-[#9ca3af] group-hover:bg-[#EBF5FB] group-hover:text-[#009FD9]"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className={cn("block text-sm font-bold leading-tight", checked ? "text-[#162543]" : "text-[#374151]")}>
                          {t(`modality.${modality}`)}
                        </span>
                        <span className="mt-1 block text-xs leading-snug text-[#6b7280]">
                          {t(`modalityDesc.${modality}`)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">{t("priceRef")} {!form.aConsultar && <span className="text-red-500">*</span>}</label>
              <div className="flex items-stretch gap-2">
                <div className={cn("flex-1", form.aConsultar && "opacity-50 pointer-events-none")}>
                  <PriceInput
                    placeholder={t("amountPlaceholder")}
                    value={form.priceAmount}
                    onChange={(v) => setForm((f) => ({ ...f, priceAmount: v }))}
                  />
                </div>
                <select
                  value={form.priceUnit}
                  onChange={(e) => setForm((f) => ({ ...f, priceUnit: e.target.value as PricingType }))}
                  disabled={form.aConsultar}
                  className="h-11 rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all disabled:opacity-50 cursor-pointer"
                >
                  {PRICE_UNITS.map((pt) => (
                    <option key={pt.value} value={pt.value}>{pt.suffix || pt.label}</option>
                  ))}
                </select>
              </div>
              <label className="mt-2.5 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.aConsultar}
                  onChange={(e) => setForm((f) => ({ ...f, aConsultar: e.target.checked }))}
                  className="h-4 w-4 rounded border-[#cbd5e1] text-[#009FD9] focus:ring-[#009FD9]"
                />
                <span className="text-sm text-[#374151]">{t("aConsultarLabel")}</span>
              </label>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">
                {t("yearsLabel")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
              </label>
              <input
                className={inputClass}
                inputMode="numeric"
                placeholder={t("yearsPlaceholder")}
                value={form.years}
                onChange={(e) => setForm((f) => ({ ...f, years: e.target.value.replace(/\D/g, "") }))}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
