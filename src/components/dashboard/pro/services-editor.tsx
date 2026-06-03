"use client";

import { useState } from "react";
import { Plus, Trash2, Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type ProService = {
  id: string;
  name: string;
  description?: string;
  price?: string;
};

interface ServicesEditorProps {
  professionalId: string;
  initialServices?: ProService[];
  onSaved?: () => void;
}

function genId() {
  return `svc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

interface ServiceFormState {
  name: string;
  description: string;
  price: string;
}

const EMPTY_FORM: ServiceFormState = { name: "", description: "", price: "" };

export function ServicesEditor({ professionalId, initialServices = [], onSaved }: ServicesEditorProps) {
  const [services, setServices] = useState<ProService[]>(initialServices);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(svc: ProService) {
    setEditingId(svc.id);
    setForm({ name: svc.name, description: svc.description ?? "", price: svc.price ?? "" });
    setFormError(null);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function persistServices(next: ProService[]) {
    setSaving(true);
    const supabase = createClient();
    await supabase.from("professionals").update({ services: next }).eq("id", professionalId);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    onSaved?.();
  }

  async function handleFormSave() {
    if (!form.name.trim()) {
      setFormError("El nombre del servicio es requerido.");
      return;
    }
    setFormError(null);

    let next: ProService[];
    if (editingId) {
      next = services.map((s) =>
        s.id === editingId
          ? { ...s, name: form.name.trim(), description: form.description.trim() || undefined, price: form.price.trim() || undefined }
          : s
      );
    } else {
      next = [
        ...services,
        {
          id: genId(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          price: form.price.trim() || undefined,
        },
      ];
    }
    setServices(next);
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    await persistServices(next);
  }

  async function handleDelete(id: string) {
    const next = services.filter((s) => s.id !== id);
    setServices(next);
    await persistServices(next);
  }

  return (
    <div>
      <p className="text-sm text-[#6b7280] mb-5">
        Agregá los servicios específicos que ofrecés. Los clientes podrán ver esto en tu perfil.
      </p>

      {/* Service list */}
      {services.length > 0 && (
        <div className="flex flex-col divide-y divide-[#f3f4f6] mb-5 border border-[#e5e7eb] rounded-xl overflow-hidden">
          {services.map((svc) => (
            <div key={svc.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-white hover:bg-[#fafafa] transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#111827] truncate">{svc.name}</p>
                {svc.description && (
                  <p className="text-xs text-[#6b7280] mt-0.5 line-clamp-1">{svc.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {svc.price && (
                  <span className="text-sm font-semibold text-[#009FD9] whitespace-nowrap">{svc.price}</span>
                )}
                <button
                  onClick={() => openEdit(svc)}
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-[#9ca3af] hover:text-[#009FD9] hover:bg-[#EBF5FB] transition-colors"
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(svc.id)}
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-[#9ca3af] hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {services.length === 0 && !showForm && (
        <div className="flex flex-col items-center gap-2 py-8 text-center rounded-xl border-2 border-dashed border-[#e5e7eb] mb-5">
          <p className="text-sm text-[#6b7280]">Todavía no agregaste ningún servicio.</p>
          <p className="text-xs text-[#9ca3af]">Agregá servicios específicos para que los clientes sepan exactamente qué ofrecés.</p>
        </div>
      )}

      {/* Inline form */}
      {showForm && (
        <div className="border border-[#009FD9]/30 bg-[#EBF5FB]/30 rounded-xl p-4 mb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[#111827]">
              {editingId ? "Editar servicio" : "Nuevo servicio"}
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
              placeholder="Describí brevemente en qué consiste este servicio..."
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <Input
            label={<>Precio <span className="text-[#9ca3af] font-normal">(opcional)</span></>}
            placeholder="Ej: ₡15,000/hora  o  Desde ₡25,000"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          />

          <div className="flex gap-2 pt-1">
            <Button onClick={handleFormSave} loading={saving} size="sm">
              {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Agregar servicio"}
            </Button>
            <Button variant="ghost" size="sm" onClick={cancelForm}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        {!showForm && (
          <Button variant="outline" size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4" />
            Agregar servicio
          </Button>
        )}
        {saved && (
          <span className={cn("flex items-center gap-1 text-sm text-emerald-600 font-medium", showForm && "hidden")}>
            <Check className="h-4 w-4" /> Guardado
          </span>
        )}
      </div>
    </div>
  );
}
