"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Trash2, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PriceInput } from "@/components/ui/price-input";
import { Modal } from "@/components/ui/modal";
import { CategorySuggestionBox } from "@/components/ui/category-suggestion";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { getCategoryLabel, getCategoryGroupLabel, getAllCategories, normalizeText } from "@/lib/data/categories";
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

  // Group the picker list by category GROUP (Hogar, Salud, Belleza…) with section
  // headers so a profession is easy to locate. `getAllCategories()` is in group order,
  // so we can group consecutive items; the search filter applies first, so only
  // matching items show (under their group headers).
  const pickerGroups = useMemo(() => {
    const groups: { id: string; items: typeof pickerList }[] = [];
    for (const cat of pickerList) {
      const last = groups[groups.length - 1];
      if (last && last.id === cat.groupId) last.items.push(cat);
      else groups.push({ id: cat.groupId, items: [cat] });
    }
    return groups;
  }, [pickerList]);

  if (professions.length === 0) {
    return (
      <div className="text-center py-8 rounded-xl border-2 border-dashed border-[#e5e7eb]">
        <p className="text-sm text-[#6b7280]">{t.rich("noProfession", rich)}</p>
      </div>
    );
  }

  const inputClass =
    "w-full h-11 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

  return (
    /* ONE clean vertical stack of per-profession CARDS (no master–detail / horizontal tabs).
       Each profession is a self-contained container: a tinted header (name + "Principal" pill +
       count + make-principal/remove) over its OWN services list + "Agregar servicio". A single
       "Agregar profesión" closes the stack. Works the same on mobile + desktop (just narrower). */
    <div className="flex flex-col gap-4">
      {professions.map((prof, i) => {
        const profServices = services.filter((s) => effectiveCategory(s) === prof);
        const isPrincipal = i === 0;
        // Entry price for this profession (cheapest priced service) — a marketplace-style
        // "Desde ₡X" summary; derived from existing data, shown only when something is priced.
        const pricedAmounts = profServices.map((s) => s.priceAmount).filter((n): n is number => typeof n === "number" && n > 0);
        const fromAmount = pricedAmounts.length ? Math.min(...pricedAmounts) : null;
        return (
          <section key={prof} className={cn("overflow-hidden rounded-2xl border bg-white shadow-sm", isPrincipal ? "border-[#bfdbfe]" : "border-[#e5e7eb]")}>
            {/* Profession header — the PRINCIPAL profession gets a subtle brand tint + navy name
                so the main area the pro offers clearly stands out; the rest stay neutral grey. */}
            <div className={cn("flex items-start justify-between gap-3 border-b px-4 sm:px-5 py-4", isPrincipal ? "border-[#dcebf6] bg-[#EBF5FB]" : "border-[#eef0f2] bg-[#f9fafb]")}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold leading-tight text-[#162543] [overflow-wrap:anywhere]">{getCategoryLabel(prof, locale)}</h3>
                  {isPrincipal && <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0089bb] ring-1 ring-inset ring-[#009FD9]/25">{t("principal")}</span>}
                </div>
                <p className="mt-1 text-xs text-[#6b7280]">
                  {t("servicesPublished", { count: profServices.length })}
                  {fromAmount != null && <> · <span className="font-medium text-[#374151]">{t("priceFrom", { amount: fromAmount.toLocaleString("es-CR") })}</span></>}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {!isPrincipal && (
                  <button type="button" onClick={() => makePrincipal(prof)} className="rounded-full border border-[#e5e7eb] bg-white px-3 py-1 text-xs font-semibold text-[#0089bb] hover:border-[#009FD9] hover:bg-[#EBF5FB] transition-colors">
                    {t("makePrincipal")}
                  </button>
                )}
                {professions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeProfession(prof)}
                    aria-label={t("removeProfession")}
                    title={t("removeProfession")}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9ca3af] hover:bg-red-50 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* This profession's services */}
            <div className="flex flex-col gap-2.5 p-3 sm:p-4">
              {profServices.length === 0 ? (
                /* Empty → a dashed "add your first service" card that IS the add affordance. */
                <button
                  type="button"
                  onClick={() => openAdd(prof)}
                  className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#bfdbfe] bg-[#f9fafb] px-4 py-7 text-center transition-colors hover:border-[#009FD9] hover:bg-[#EBF5FB]"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
                    <Plus className="h-5 w-5 text-[#009FD9]" />
                  </span>
                  <span className="text-sm font-semibold text-[#0089bb]">{t("addFirstInProfession", { profession: getCategoryLabel(prof, locale) })}</span>
                  <span className="max-w-xs text-xs text-[#9ca3af]">{t("addFirstHelp")}</span>
                </button>
              ) : (
                <>
                  {profServices.map((svc) => (
                    /* Catalog-style service row (Fiverr/Shopify): name + brief, the PRICE as a
                       brand-tint TAG chip (or an amber "Agregar precio" nudge when missing), and
                       quiet edit/delete actions. `min-w-0` + `break-words` keep long names inside. */
                    /* ALIGNED-TABLE row (Stripe Dashboard / Apple Settings "label : value"):
                       name on the left, the PRICE right-aligned in its own column so prices line
                       up vertically down the list; the brief is a muted 1-line subline; edit/delete
                       are quiet — always visible on mobile, revealed on hover on desktop. */
                    <div key={svc.id} className="group flex items-center gap-3 rounded-xl border border-[#e5e7eb] px-3.5 py-3 transition-colors hover:bg-[#fafafa]">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-3">
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#111827]">{svc.name}</p>
                          {svc.price ? (
                            <span className="shrink-0 text-sm font-semibold text-[#0089bb]">{svc.price}</span>
                          ) : (
                            <button type="button" onClick={() => openEdit(svc)} className="shrink-0 text-xs font-semibold text-[#b45309] hover:underline">{t("addPrice")}</button>
                          )}
                        </div>
                        {svc.description && <p className="mt-0.5 truncate text-xs text-[#6b7280]">{svc.description}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <button onClick={() => openEdit(svc)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9ca3af] hover:bg-[#EBF5FB] hover:text-[#009FD9] transition-colors" title={t("edit")} aria-label={t("edit")}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(svc.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9ca3af] hover:bg-red-50 hover:text-red-500 transition-colors" title={t("delete")} aria-label={t("delete")}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => openAdd(prof)}
                    className="w-full rounded-xl border border-dashed border-[#bfdbfe] py-2.5 text-sm font-semibold text-[#0089bb] hover:border-[#009FD9] hover:bg-[#EBF5FB] transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="h-4 w-4" /> {t("addService")}
                  </button>
                </>
              )}
            </div>
          </section>
        );
      })}

      {/* Add another profession — ONE clear full-width action below the stack. */}
      <button
        type="button"
        onClick={() => { setShowPicker(true); setPickerQuery(""); }}
        className="w-full rounded-2xl border border-dashed border-[#cbd5e1] py-3.5 text-sm font-semibold text-[#0089bb] hover:border-[#009FD9] hover:bg-[#EBF5FB] transition-all flex items-center justify-center gap-2"
      >
        <Plus className="h-4 w-4" /> {t("addProfession")}
      </button>


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
              pickerGroups.map((g) => (
                <div key={g.id} className="mb-1 last:mb-0">
                  <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">
                    {getCategoryGroupLabel(g.id, locale)}
                  </p>
                  {g.items.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => addProfession(cat.id)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-[#374151] hover:bg-[#EBF5FB] hover:text-[#0089bb] transition-colors"
                    >
                      <Plus className="h-4 w-4 shrink-0 text-[#009FD9]" /> {getCategoryLabel(cat.id, locale)}
                    </button>
                  ))}
                </div>
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
