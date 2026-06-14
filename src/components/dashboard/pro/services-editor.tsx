"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Trash2, Check, Pencil, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PriceInput } from "@/components/ui/price-input";
import { CategorySearch } from "@/components/ui/category-search";
import { createClient } from "@/lib/supabase/client";
import { getCategoryLabel } from "@/lib/data/categories";
import { SaveStatus } from "@/components/dashboard/save-status";
import { PRICING_TYPES, formatServicePrice, type PricingType } from "@/lib/pricing";

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

interface ServiceFormState {
  name: string;
  description: string;
  priceType: PricingType;
  priceAmount: string;
  years: string;
}

const EMPTY_FORM: ServiceFormState = { name: "", description: "", priceType: "por_hora", priceAmount: "", years: "" };

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

  // Add-profession UI
  const [addingProfession, setAddingProfession] = useState(false);
  const [newProfession, setNewProfession] = useState("");
  const [professionError, setProfessionError] = useState<string | null>(null);

  // Service form UI (the form is bound to one profession at a time).
  // Empty string = form closed; a category id = form open under that profession.
  const [formCategory, setFormCategory] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  function confirmAddProfession() {
    if (!newProfession) {
      setProfessionError(t("chooseProfession"));
      return;
    }
    if (professions.includes(newProfession)) {
      setProfessionError(t("alreadyAdded"));
      return;
    }
    const next = [...professions, newProfession];
    setProfessions(next);
    setNewProfession("");
    setAddingProfession(false);
    setProfessionError(null);
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
    setForm({
      name: svc.name,
      description: svc.description ?? "",
      priceType: svc.priceType ?? "por_hora",
      priceAmount: svc.priceAmount != null ? String(svc.priceAmount) : "",
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
    setFormError(null);

    const amount = form.priceAmount.trim() ? Number(form.priceAmount.replace(/\D/g, "")) : undefined;
    const priceType = form.priceType;
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

  if (professions.length === 0) {
    return (
      <div className="text-center py-8 rounded-xl border-2 border-dashed border-[#e5e7eb]">
        <p className="text-sm text-[#6b7280]">{t.rich("noProfession", rich)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* App-wide autosave: changes persist per action; consistent status. */}
      <SaveStatus saving={saving} saved={saved} />
      <p className="text-sm text-[#6b7280]">
        {t.rich("intro", rich)}
      </p>

      {/* One CARD per PROFESSION — the profession is the group header and its
          services live inside it, so the profession → services structure is
          obvious. Single border per card (R1: no nested bordered boxes; the form
          and list use tinted/hairline surfaces, not extra borders). */}
      {professions.map((prof, i) => {
        const profServices = services.filter((s) => effectiveCategory(s) === prof);
        const formHere = formOpen && formCategory === prof;
        return (
          <section key={prof} className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
            {/* Profession header (no icon) */}
            <div className="flex items-center gap-3 px-4 sm:px-5 py-3 bg-[#f9fafb] border-b border-[#eef2f5]">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#111827] flex items-center gap-2">
                  <span className="truncate">{getCategoryLabel(prof, locale)}</span>
                  {i === 0 && <span className="shrink-0 rounded-full bg-[#EBF5FB] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0089bb]">{t("principal")}</span>}
                </p>
                <p className="text-[11px] text-[#9ca3af]">{t("servicesCount", { count: profServices.length })}</p>
              </div>
              {/* Mark a non-principal profession as the MAIN one (moves it first). */}
              {i > 0 && (
                <button onClick={() => makePrincipal(prof)} className="shrink-0 text-xs font-medium text-[#009FD9] hover:underline" aria-label={t("makePrincipal")}>
                  {t("makePrincipal")}
                </button>
              )}
              {professions.length > 1 && (
                <button onClick={() => removeProfession(prof)} className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center text-[#9ca3af] hover:text-red-500 hover:bg-red-50 transition-colors" aria-label={t("removeProfession")}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="p-3 sm:p-4 flex flex-col gap-2">
              {/* Services for this profession */}
              {profServices.length > 0 && (
                <div className="flex flex-col divide-y divide-[#f3f4f6]">
                  {profServices.map((svc) => (
                    <div key={svc.id} className="flex items-center justify-between gap-3 py-2.5 hover:bg-[#fafafa] transition-colors -mx-2 px-2 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#111827] truncate">{svc.name}</p>
                        {svc.description && <p className="text-xs text-[#6b7280] mt-0.5 line-clamp-1">{svc.description}</p>}
                        {svc.years != null && <p className="text-xs text-[#9ca3af] mt-0.5">{t("experience", { years: svc.years })}</p>}
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        {svc.price && <span className="text-sm font-semibold text-[#009FD9] whitespace-nowrap">{svc.price}</span>}
                        <button onClick={() => openEdit(svc)} className="h-8 w-8 rounded-lg flex items-center justify-center text-[#9ca3af] hover:text-[#009FD9] hover:bg-[#EBF5FB] transition-colors" title={t("edit")}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(svc.id)} className="h-8 w-8 rounded-lg flex items-center justify-center text-[#9ca3af] hover:text-red-500 hover:bg-red-50 transition-colors" title={t("delete")}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state — inviting, clickable prompt to add the first service. */}
              {profServices.length === 0 && !formHere && (
                <button
                  onClick={() => openAdd(prof)}
                  className="w-full rounded-xl border-2 border-dashed border-[#d1d5db] py-4 px-3 flex flex-col items-center justify-center gap-1.5 text-center hover:border-[#009FD9] hover:bg-[#EBF5FB] transition-all"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EBF5FB] text-[#009FD9]"><Plus className="h-4 w-4" /></span>
                  <span className="text-sm font-medium text-[#374151]">{t("addFirstInProfession", { profession: getCategoryLabel(prof, locale) })}</span>
                </button>
              )}

              {/* Inline add/edit form (tinted surface, no border → no box-in-box). */}
              {formHere && (
                <div className="rounded-xl bg-[#f9fafb] p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-[#111827]">
                      {editingId ? t("editService") : t("newService", { profession: getCategoryLabel(prof, locale) })}
                    </p>
                    <button onClick={cancelForm} className="text-[#9ca3af] hover:text-[#374151] transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {formError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{formError}</p>
                  )}

                  <Input
                    label={t("nameLabel")}
                    placeholder={t("namePlaceholder")}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    autoFocus
                  />
                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">
                      {t("description")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
                    </label>
                    <textarea
                      className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[72px] resize-none focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                      placeholder={t("descPlaceholder")}
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">
                      {t("price")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        value={form.priceType}
                        onChange={(e) => setForm((f) => ({ ...f, priceType: e.target.value as PricingType }))}
                        className="h-10 px-3 rounded-xl border border-[#e5e7eb] bg-white text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                      >
                        {PRICING_TYPES.map((pt) => (
                          <option key={pt.value} value={pt.value}>{pt.label}</option>
                        ))}
                      </select>
                      {form.priceType !== "a_convenir" && (
                        <div className="flex-1">
                          <PriceInput
                            placeholder="15000"
                            value={form.priceAmount}
                            onChange={(v) => setForm((f) => ({ ...f, priceAmount: v }))}
                          />
                        </div>
                      )}
                    </div>
                    {form.priceType !== "a_convenir" && form.priceAmount && (
                      <p className="text-xs text-emerald-600 mt-1">{t("willShowAs", { price: formatServicePrice(Number(form.priceAmount.replace(/\D/g, "")), form.priceType) ?? "" })}</p>
                    )}
                  </div>

                  <Input
                    label={<>{t("yearsLabel")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span></>}
                    type="number"
                    inputMode="numeric"
                    placeholder={t("yearsPlaceholder")}
                    value={form.years}
                    onChange={(e) => setForm((f) => ({ ...f, years: e.target.value }))}
                  />
                  <div className="flex gap-2 pt-1">
                    <Button onClick={handleFormSave} loading={saving} size="sm">
                      {saving ? t("saving") : editingId ? t("saveChanges") : t("addServiceBtn")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelForm}>{t("cancel")}</Button>
                  </div>
                </div>
              )}

              {/* Add another service — shown when there are already services and the
                  form isn't open here. */}
              {profServices.length > 0 && !formHere && (
                <button
                  onClick={() => openAdd(prof)}
                  className="self-start inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-[#009FD9] hover:bg-[#EBF5FB] transition-colors"
                >
                  <Plus className="h-4 w-4" /> {t("addService")}
                </button>
              )}
            </div>
          </section>
        );
      })}

      {/* Add another profession — a profession groups its own services. */}
      {addingProfession ? (
        <div className="rounded-2xl border border-dashed border-[#d1d5db] p-4 flex flex-col gap-2">
          <CategorySearch
            value={newProfession}
            onChange={(v) => { setNewProfession(v); setProfessionError(null); }}
            placeholder={t("searchProfession")}
            error={professionError ?? undefined}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={confirmAddProfession}>{t("add")}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAddingProfession(false); setNewProfession(""); setProfessionError(null); }}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setAddingProfession(true); setProfessionError(null); }}
          className="self-start inline-flex items-center gap-1.5 text-sm font-medium text-[#009FD9] hover:underline"
        >
          <Plus className="h-4 w-4" /> {t("addProfession")}
        </button>
      )}

      {/* Persistent save status — every change (add / edit / delete) autosaves;
          this line always tells the pro the current state, so there's never a
          "did it save?" ambiguity. */}
      <div className="flex items-center gap-1.5 text-sm pt-1 border-t border-[#f3f4f6] mt-1">
        {saving ? (
          <span className="flex items-center gap-1.5 text-[#6b7280] font-medium">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("saving")}
          </span>
        ) : saved ? (
          <span className="flex items-center gap-1 text-emerald-600 font-medium">
            <Check className="h-4 w-4" /> {t("saved")}
          </span>
        ) : (
          <span className="text-[#9ca3af]">{t("savedAuto")}</span>
        )}
      </div>
    </div>
  );
}
