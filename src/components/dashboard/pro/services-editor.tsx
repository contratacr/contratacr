"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Trash2, Pencil, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PriceInput } from "@/components/ui/price-input";
import { Modal } from "@/components/ui/modal";
import { CategorySuggestionBox } from "@/components/ui/category-suggestion";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { getCategoryLabel, getAllCategories, normalizeText } from "@/lib/data/categories";
import { useCustomCategories } from "@/lib/data/use-custom-categories";
import { PRICING_TYPES, formatServicePrice, type PricingType } from "@/lib/pricing";
import { useReportSaveStatus } from "@/components/dashboard/save-status-context";

export type ProService = {
  id: string;
  name: string;
  description?: string;
  price?: string;          // display string (kept in sync from amount+type)
  priceAmount?: number;    // colones (optional)
  priceType?: PricingType; // por_hora | por_proyecto | …
  years?: number;          // years of experience in THIS service (optional)
  // Which profession this service belongs to (a category id). Defaults to the
  // primary profession for legacy services created before multi-profession.
  category?: string;
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

// Price units offered in the service modal's <select> (the "Precio a consultar"
// checkbox covers a_convenir separately, so it's excluded here).
const PRICE_UNITS = PRICING_TYPES.filter((p) => p.value !== "a_convenir");

interface ServiceFormState {
  name: string;
  description: string;
  priceUnit: PricingType;   // a non-a_convenir unit (por_hora, por_proyecto, …)
  priceAmount: string;
  aConsultar: boolean;      // "Precio a consultar" → persists as priceType a_convenir
  years: string;            // preserved from existing data (no input in the new modal)
}

const EMPTY_FORM: ServiceFormState = { name: "", description: "", priceUnit: "por_hora", priceAmount: "", aConsultar: false, years: "" };

export function ServicesEditor({
  professionalId,
  primaryCategory,
  initialProfessions = [],
  initialServices = [],
  onSaved,
}: ServicesEditorProps) {
  const locale = useLocale();
  const t = useTranslations("servicesEditor");
  const rich = { strong: (c: React.ReactNode) => <strong>{c}</strong> };
  const seedProfessions =
    initialProfessions.length > 0
      ? initialProfessions
      : primaryCategory
        ? [primaryCategory]
        : [];

  const [professions, setProfessions] = useState<string[]>(seedProfessions);
  const [services, setServices] = useState<ProService[]>(initialServices);

  // Master–detail: which profession's services are shown on the right.
  const [selectedProfession, setSelectedProfession] = useState<string>(seedProfessions[0] ?? "");

  // Add-profession picker (modal)
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  // Admin-approved custom categories — selectable as professions too.
  const customCategories = useCustomCategories();
  // "¿No ves tu profesión?" lives in the shared <CategorySuggestionBox> (same
  // component the publicar-proyecto picker uses), so its state is self-contained
  // and resets each time the modal re-mounts.
  function closePicker() {
    setShowPicker(false);
    setPickerQuery("");
  }

  // Service form (modal). Empty formCategory + null editingId = closed.
  const [formCategory, setFormCategory] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // App-wide autosave: report status to the section title row (inline, no layout shift).
  // Called BEFORE the early "no professions" return so the hook order stays stable.
  useReportSaveStatus(saving, saved);

  const primary = professions[0];

  function effectiveCategory(s: ProService): string {
    return s.category ?? primary ?? "";
  }

  // Keep the selected profession valid as professions change.
  useEffect(() => {
    if (professions.length > 0 && !professions.includes(selectedProfession)) {
      setSelectedProfession(professions[0]);
    }
  }, [professions, selectedProfession]);

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

  function addProfession(id: string) {
    if (!id || professions.includes(id)) return;
    const next = [...professions, id];
    setProfessions(next);
    setSelectedProfession(id);
    closePicker();
    persist(next, services);
  }

  // Make a profession the PRINCIPAL one (index 0 = principal everywhere).
  function makePrincipal(id: string) {
    if (professions[0] === id) return;
    const next = [id, ...professions.filter((p) => p !== id)];
    setProfessions(next);
    persist(next, services);
  }

  function removeProfession(id: string) {
    if (professions.length <= 1) return; // keep at least one
    const next = professions.filter((p) => p !== id);
    // Reassign any services from the removed profession to the new primary.
    const nextServices = services.map((s) =>
      effectiveCategory(s) === id ? { ...s, category: next[0] } : s
    );
    setProfessions(next);
    setServices(nextServices);
    setSelectedProfession(next[0]);
    persist(next, nextServices);
  }

  function openAdd(category: string) {
    setEditingId(null);
    setFormCategory(category);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function openEdit(svc: ProService) {
    setEditingId(svc.id);
    setFormCategory(effectiveCategory(svc));
    const isAsk = svc.priceType === "a_convenir";
    setForm({
      name: svc.name,
      description: svc.description ?? "",
      priceUnit: svc.priceType && !isAsk ? svc.priceType : "por_hora",
      priceAmount: svc.priceAmount != null ? String(svc.priceAmount) : "",
      aConsultar: isAsk,
      years: svc.years != null ? String(svc.years) : "",
    });
    setFormError(null);
  }

  function cancelForm() {
    setEditingId(null);
    setFormCategory("");
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  const formOpen = editingId !== null || formCategory !== "";

  async function handleFormSave() {
    if (!form.name.trim()) {
      setFormError(t("nameRequired"));
      return;
    }
    // Don't silently default to "Consultar precio": require an explicit price OR the
    // deliberate "Precio a consultar" choice.
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

    let next: ProService[];
    if (editingId) {
      next = services.map((s) =>
        s.id === editingId
          ? {
              ...s,
              name: form.name.trim(),
              description: form.description.trim() || undefined,
              priceAmount: amount,
              priceType,
              price: priceDisplay,
              years,
              category: formCategory || s.category,
            }
          : s
      );
    } else {
      next = [
        ...services,
        {
          id: genId(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          priceAmount: amount,
          priceType,
          price: priceDisplay,
          years,
          category: formCategory || primary,
        },
      ];
    }
    setServices(next);
    cancelForm();
    await persist(professions, next);
  }

  async function handleDelete(id: string) {
    const next = services.filter((s) => s.id !== id);
    setServices(next);
    await persist(professions, next);
  }

  // Professions available to add (taxonomy minus the ones already added), filtered
  // by the picker's search (label + keywords, accent-insensitive).
  const pickerList = useMemo(() => {
    const base = getAllCategories().filter((c) => !professions.includes(c.id));
    const q = normalizeText(pickerQuery.trim());
    if (!q) return base;
    return base.filter(
      (c) => normalizeText(getCategoryLabel(c.id, locale)).includes(q) || c.keywords.some((k) => normalizeText(k).includes(q))
    );
    // customCategories in deps so the list refreshes once approved customs load.
  }, [pickerQuery, professions, locale, customCategories]);

  if (professions.length === 0) {
    return (
      <div className="text-center py-8 rounded-xl border-2 border-dashed border-[#e5e7eb]">
        <p className="text-sm text-[#6b7280]">{t.rich("noProfession", rich)}</p>
      </div>
    );
  }

  const detailServices = services.filter((s) => effectiveCategory(s) === selectedProfession);
  const isPrincipalSelected = selectedProfession === primary;
  const inputClass =
    "w-full h-11 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

  return (
    <div className="flex flex-col gap-4">
      {/* ── MOBILE (<lg): professions as a HORIZONTAL SCROLLING TAB ROW ──
          Each tab `shrink-0`; the row scrolls horizontally with the scrollbar
          hidden. The vertical sidebar (below) is hidden on mobile. */}
      <div className="lg:hidden -mx-1 flex gap-2 overflow-x-auto hide-scrollbar px-1 pb-1">
        {professions.map((prof, i) => {
          const count = services.filter((s) => effectiveCategory(s) === prof).length;
          const selected = prof === selectedProfession;
          return (
            <button
              key={prof}
              type="button"
              onClick={() => setSelectedProfession(prof)}
              className={cn(
                "shrink-0 w-[160px] rounded-xl border px-3 py-2.5 text-left transition-colors",
                selected ? "border-[#009FD9] bg-[#EBF5FB]" : "border-[#e5e7eb] bg-white hover:bg-[#f9fafb]"
              )}
            >
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-[#111827]">{getCategoryLabel(prof, locale)}</span>
                {i === 0 && <span className="shrink-0 text-xs font-medium text-[#009FD9]">{t("principal")}</span>}
              </span>
              <span className="mt-0.5 block text-[11px] text-[#9ca3af]">{t("servicesCount", { count })}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => { setShowPicker(true); setPickerQuery(""); }}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-[#cbd5e1] px-4 text-sm font-semibold text-[#0089bb] hover:border-[#009FD9] hover:bg-[#EBF5FB] transition-all"
        >
          <Plus className="h-4 w-4" /> {t("addProfession")}
        </button>
      </div>

      <div className="flex gap-4">
        {/* ── DESKTOP (≥lg): fixed-width LEFT sidebar of professions (the AREAS) ── */}
        <div className="hidden shrink-0 flex-col gap-2 lg:flex lg:w-[230px]">
          {professions.map((prof, i) => {
            const count = services.filter((s) => effectiveCategory(s) === prof).length;
            const selected = prof === selectedProfession;
            return (
              <button
                key={prof}
                type="button"
                onClick={() => setSelectedProfession(prof)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left flex items-center gap-2 transition-colors",
                  selected ? "border-[#009FD9] bg-[#EBF5FB]" : "border-[#e5e7eb] bg-white hover:bg-[#f9fafb]"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-[#111827] truncate">{getCategoryLabel(prof, locale)}</span>
                    {i === 0 && <span className="shrink-0 text-xs font-medium text-[#009FD9]">{t("principal")}</span>}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[#9ca3af]">{t("servicesCount", { count })}</span>
                </span>
                <ChevronRight className={cn("h-4 w-4 shrink-0", selected ? "text-[#009FD9]" : "text-[#cbd5e1]")} />
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => { setShowPicker(true); setPickerQuery(""); }}
            className="mt-1 w-full rounded-xl border border-dashed border-[#cbd5e1] py-2.5 text-sm font-semibold text-[#0089bb] hover:border-[#009FD9] hover:bg-[#EBF5FB] transition-all flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" /> {t("addProfession")}
          </button>
        </div>

        {/* ── DETAIL: services of the selected profession — full-width on mobile,
              flex-1 beside the sidebar on desktop. ── */}
        <div className="min-w-0 flex-1 rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold leading-tight text-[#111827] truncate">{getCategoryLabel(selectedProfession, locale)}</h3>
              <p className="mt-0.5 text-xs text-[#6b7280]">{t("servicesPublished", { count: detailServices.length })}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isPrincipalSelected ? (
                <span className="rounded-full bg-[#EBF5FB] px-2.5 py-1 text-xs font-semibold text-[#0089bb]">{t("principal")}</span>
              ) : (
                <button type="button" onClick={() => makePrincipal(selectedProfession)} className="text-xs font-medium text-[#009FD9] hover:underline">
                  {t("makePrincipal")}
                </button>
              )}
              {professions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeProfession(selectedProfession)}
                  aria-label={t("removeProfession")}
                  title={t("removeProfession")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9ca3af] hover:bg-red-50 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Services */}
          <div className="mt-4 flex flex-col gap-2.5">
            {detailServices.length === 0 ? (
              /* Empty → a dashed "add your first service" card that IS the add affordance. */
              <button
                type="button"
                onClick={() => openAdd(selectedProfession)}
                className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#bfdbfe] bg-[#f9fafb] px-4 py-8 text-center transition-colors hover:border-[#009FD9] hover:bg-[#EBF5FB]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm">
                  <Plus className="h-5 w-5 text-[#009FD9]" />
                </span>
                <span className="text-sm font-semibold text-[#0089bb]">{t("addFirstInProfession", { profession: getCategoryLabel(selectedProfession, locale) })}</span>
                <span className="max-w-xs text-xs text-[#9ca3af]">{t("addFirstHelp")}</span>
              </button>
            ) : (
              <>
                {detailServices.map((svc) => (
                  <div key={svc.id} className="flex items-start justify-between gap-3 rounded-xl border border-[#e5e7eb] p-3.5">
                    {/* `min-w-0` + `break-words` let a long name (even one unbroken word) WRAP within its
                        own column instead of overflowing onto the price. */}
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold text-[#111827]">{svc.name}</p>
                      {svc.description && <p className="mt-0.5 break-words text-xs text-[#6b7280] line-clamp-2">{svc.description}</p>}
                    </div>
                    {/* Price + actions: fixed width, right-aligned, top-aligned with the name; never shrinks. */}
                    <div className="flex shrink-0 items-center gap-2">
                      {svc.price && <span className="max-w-[10rem] break-words text-right text-sm font-semibold text-[#009FD9]">{svc.price}</span>}
                      <button onClick={() => openEdit(svc)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f3f4f6] text-[#6b7280] hover:bg-[#EBF5FB] hover:text-[#009FD9] transition-colors" title={t("edit")} aria-label={t("edit")}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(svc.id)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f3f4f6] text-[#6b7280] hover:bg-red-50 hover:text-red-500 transition-colors" title={t("delete")} aria-label={t("delete")}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => openAdd(selectedProfession)}
                  className="mt-1 w-full rounded-xl border border-dashed border-[#bfdbfe] py-2.5 text-sm font-semibold text-[#0089bb] hover:border-[#009FD9] hover:bg-[#EBF5FB] transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" /> {t("addService")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>


      {/* ── Add-profession picker ─────────────────────────────────────── */}
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
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder={t("pickerSearch")}
                autoFocus
                className="w-full h-11 rounded-xl border border-[#e5e7eb] bg-white pl-9 pr-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
              />
            </div>
          </div>
          <div className="px-3 py-2 sm:px-4">
            {/* No match → a clear two-line message that points to the suggestion box below
                (matches the publicar-proyecto category picker's empty state). */}
            {pickerList.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="mb-1 text-sm font-medium text-[#374151]">{t("pickerNoResults")}</p>
                <p className="text-xs text-[#9ca3af]">{t("pickerNoResultsHint")}</p>
              </div>
            ) : (
              pickerList.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => addProfession(cat.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-[#374151] hover:bg-[#EBF5FB] hover:text-[#0089bb] transition-colors"
                >
                  <Plus className="h-4 w-4 shrink-0 text-[#009FD9]" /> {getCategoryLabel(cat.id, locale)}
                </button>
              ))
            )}

            {/* "¿No ves tu profesión?" — the SAME shared component the
                publicar-proyecto picker uses: type → submit → admin reviews →
                on approval it becomes a real, selectable profession. No "otro"
                selectable, so there's no "otro"-to-"otro" auto-matching. */}
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

      {/* ── Add / edit service ────────────────────────────────────────── */}
      {formOpen && (
        <Modal
          onClose={cancelForm}
          title={editingId ? t("editService") : t("newServiceShort")}
          subtitle={t("inProfession", { profession: getCategoryLabel(formCategory, locale) })}
          closeLabel={t("cancel")}
          footer={
            <>
              <Button type="button" variant="outline" onClick={cancelForm}>{t("cancel")}</Button>
              <Button type="button" onClick={handleFormSave} loading={saving} disabled={!form.name.trim() || saving}>
                {editingId ? t("saveChanges") : t("addServiceBtn")}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {formError && (
              <p className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">{formError}</p>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">{t("nameField")}</label>
              <input
                className={inputClass}
                placeholder={formCategory === "otro" ? t("otherNamePlaceholder") : t("namePlaceholderShort")}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
              {/* For "otro", clarify it's free text AND that clients find it by searching. */}
              {formCategory === "otro" && (
                <p className="mt-1.5 text-xs text-[#9ca3af]">{t("otherHelp")}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">{t("descBrief")}</label>
              <textarea
                className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[88px] resize-none focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                placeholder={t("descPlaceholderShort")}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
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
          </div>
        </Modal>
      )}
    </div>
  );
}
