"use client";

import { useState } from "react";
import { Plus, Trash2, Check, Pencil, X, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PriceInput } from "@/components/ui/price-input";
import { CategorySearch } from "@/components/ui/category-search";
import { createClient } from "@/lib/supabase/client";
import { getCategoryLabel } from "@/lib/data/categories";
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
      setProfessionError("Elige una profesión.");
      return;
    }
    if (professions.includes(newProfession)) {
      setProfessionError("Ya agregaste esa profesión.");
      return;
    }
    const next = [...professions, newProfession];
    setProfessions(next);
    setNewProfession("");
    setAddingProfession(false);
    setProfessionError(null);
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
      setFormError("El nombre del servicio es requerido.");
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
        <p className="text-sm text-[#6b7280]">Primero elige tu profesión principal en la pestaña <strong>Mi perfil</strong>.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[#6b7280]">
        Organiza tus servicios por profesión. Puedes ofrecer más de una profesión —
        cada servicio se agrega bajo la profesión a la que pertenece.
      </p>

      {/* ── Professions manager ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#e5e7eb] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-[#009FD9]" />
            <h3 className="text-sm font-semibold text-[#111827]">Tus profesiones</h3>
          </div>
          {!addingProfession && (
            <button
              onClick={() => { setAddingProfession(true); setProfessionError(null); }}
              className="flex items-center gap-1 text-xs font-medium text-[#009FD9] hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar profesión
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {professions.map((p, i) => (
            <span key={p} className="inline-flex items-center gap-1.5 rounded-lg bg-[#EBF5FB] text-[#0089bb] text-sm font-medium pl-3 pr-1.5 py-1.5">
              {getCategoryLabel(p)}
              {i === 0 && <span className="text-[10px] font-bold uppercase tracking-wide text-[#009FD9]/70">Principal</span>}
              {professions.length > 1 && (
                <button onClick={() => removeProfession(p)} className="rounded-md p-0.5 hover:bg-[#009FD9]/20 transition-colors" aria-label="Quitar profesión">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>

        {addingProfession && (
          <div className="mt-3 flex flex-col gap-2">
            <CategorySearch
              value={newProfession}
              onChange={(v) => { setNewProfession(v); setProfessionError(null); }}
              placeholder="Busca otra profesión… ej. fotógrafo, electricista"
              error={professionError ?? undefined}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={confirmAddProfession}>Agregar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAddingProfession(false); setNewProfession(""); setProfessionError(null); }}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Services grouped by profession ──────────────────────────────── */}
      {professions.map((prof) => {
        const profServices = services.filter((s) => effectiveCategory(s) === prof);
        return (
          <div key={prof} className="rounded-2xl border border-[#e5e7eb] p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#111827]">{getCategoryLabel(prof)}</h3>
              <button
                onClick={() => openAdd(prof)}
                className="flex items-center gap-1 text-xs font-medium text-[#009FD9] hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar servicio
              </button>
            </div>

            {profServices.length === 0 && (editingId !== null || formCategory !== prof) && (
              <p className="text-xs text-[#9ca3af] py-2">Todavía no agregaste servicios bajo esta profesión.</p>
            )}

            {profServices.length > 0 && (
              <div className="flex flex-col divide-y divide-[#f3f4f6] border border-[#e5e7eb] rounded-xl overflow-hidden">
                {profServices.map((svc) => (
                  <div key={svc.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-white hover:bg-[#fafafa] transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#111827] truncate">{svc.name}</p>
                      {svc.description && <p className="text-xs text-[#6b7280] mt-0.5 line-clamp-1">{svc.description}</p>}
                      {svc.years != null && <p className="text-xs text-[#9ca3af] mt-0.5">{svc.years} {svc.years === 1 ? "año" : "años"} de experiencia</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {svc.price && <span className="text-sm font-semibold text-[#009FD9] whitespace-nowrap">{svc.price}</span>}
                      <button onClick={() => openEdit(svc)} className="h-7 w-7 rounded-lg flex items-center justify-center text-[#9ca3af] hover:text-[#009FD9] hover:bg-[#EBF5FB] transition-colors" title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(svc.id)} className="h-7 w-7 rounded-lg flex items-center justify-center text-[#9ca3af] hover:text-red-500 hover:bg-red-50 transition-colors" title="Eliminar">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Inline form for this profession */}
            {formOpen && formCategory === prof && (
              <div className="border border-[#009FD9]/30 bg-[#EBF5FB]/30 rounded-xl p-4 mt-3 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#111827]">
                    {editingId ? "Editar servicio" : `Nuevo servicio · ${getCategoryLabel(prof)}`}
                  </p>
                  <button onClick={cancelForm} className="text-[#9ca3af] hover:text-[#374151] transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {formError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{formError}</p>
                )}

                <Input
                  label="Nombre del servicio *"
                  placeholder="Ej: Instalación eléctrica residencial"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
                <div>
                  <label className="text-sm font-medium text-[#374151] block mb-1.5">
                    Descripción <span className="text-[#9ca3af] font-normal">(opcional)</span>
                  </label>
                  <textarea
                    className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[72px] resize-none focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                    placeholder="Describe brevemente en qué consiste este servicio..."
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#374151] block mb-1.5">
                    Precio <span className="text-[#9ca3af] font-normal">(opcional)</span>
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
                    <p className="text-xs text-emerald-600 mt-1">Se mostrará como: {formatServicePrice(Number(form.priceAmount.replace(/\D/g, "")), form.priceType)}</p>
                  )}
                </div>

                <Input
                  label={<>Años de experiencia en este servicio <span className="text-[#9ca3af] font-normal">(opcional)</span></>}
                  type="number"
                  inputMode="numeric"
                  placeholder="Ej: 5"
                  value={form.years}
                  onChange={(e) => setForm((f) => ({ ...f, years: e.target.value }))}
                />
                <div className="flex gap-2 pt-1">
                  <Button onClick={handleFormSave} loading={saving} size="sm">
                    {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Agregar servicio"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelForm}>Cancelar</Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {saved && (
        <span className="flex items-center gap-1 text-sm text-emerald-600 font-medium">
          <Check className="h-4 w-4" /> Guardado
        </span>
      )}
    </div>
  );
}
