"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { Camera, Check, X, Plus } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PROVINCES, getCantonsByProvince } from "@/lib/data/cr-geography";
import { CategorySearch } from "@/components/ui/category-search";
import { getCategoryLabel } from "@/lib/data/categories";
import { PRICING_TYPES, type PricingTier, type PricingType } from "@/lib/pricing";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProData = Record<string, any>;

interface ProfileEditorProps {
  professionalId: string;
  profileId: string;
  initial: ProData;
  onSaved?: () => void;
}

export function ProfileEditor({ professionalId, profileId, initial, onSaved }: ProfileEditorProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [bio, setBio] = useState<string>(initial.bio ?? "");
  const [whatsapp, setWhatsapp] = useState<string>(initial.whatsapp ?? "");
  const [yearsExp, setYearsExp] = useState(String(initial.years_experience ?? ""));
  const [fullName, setFullName] = useState<string>(initial.profiles?.full_name ?? "");
  const seedProfessions: string[] =
    Array.isArray(initial.professions) && initial.professions.length > 0
      ? initial.professions
      : initial.category_id ? [initial.category_id] : [];
  const [professions, setProfessions] = useState<string[]>(seedProfessions);
  const [addCat, setAddCat] = useState("");
  const [pricing, setPricing] = useState<PricingTier[]>(
    Array.isArray(initial.pricing) ? initial.pricing : []
  );
  const [provinceId, setProvinceId] = useState<string>(initial.provincia_id ?? "");
  const [cantonId, setCantonId] = useState<string>(initial.canton_id ?? "");
  const [address, setAddress] = useState<string>(initial.address ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    initial.profiles?.avatar_url ?? null
  );
  const [photoUploading, setPhotoUploading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cantons = getCantonsByProvince(provinceId);

  function addProfession(id: string) {
    if (!id || professions.includes(id)) { setAddCat(""); return; }
    setProfessions((prev) => [...prev, id]);
    setAddCat("");
    setSaved(false);
  }
  function removeProfession(id: string) {
    setProfessions((prev) => (prev.length > 1 ? prev.filter((p) => p !== id) : prev));
    setSaved(false);
  }
  function addTier() {
    setPricing((prev) => [...prev, { id: `pr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, type: "por_hora", amount: undefined }]);
    setSaved(false);
  }
  function updateTier(id: string, patch: Partial<PricingTier>) {
    setPricing((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setSaved(false);
  }
  function removeTier(id: string) {
    setPricing((prev) => prev.filter((p) => p.id !== id));
    setSaved(false);
  }

  // Auto-upload the photo as soon as it's picked — no "Guardar cambios" needed.
  // Shows an instant local preview, then swaps in the hosted URL on success.
  async function handlePhotoSelect(file: File) {
    setError(null);
    setAvatarPreview(URL.createObjectURL(file));
    setPhotoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/photo", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const { url } = await res.json();
      const supabase = createClient();
      await supabase.from("profiles").update({ avatar_url: url }).eq("id", profileId);
      await supabase.auth.updateUser({ data: { avatar_url: url } });
      setAvatarPreview(url);
      onSaved?.();
    } catch {
      setError("No se pudo subir la foto. Intentá de nuevo.");
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const supabase = createClient();

    try {
      // Keep legacy hourly_rate in sync with a "por_hora" tier for back-compat.
      const hourTier = pricing.find((p) => p.type === "por_hora" && p.amount);
      const cleanPricing = pricing
        .filter((p) => p.type === "a_convenir" || p.amount != null)
        .map((p) => ({ ...p, amount: p.type === "a_convenir" ? undefined : p.amount }));

      const { error: proError } = await supabase
        .from("professionals")
        .update({
          bio,
          whatsapp,
          hourly_rate: hourTier?.amount ?? null,
          pricing: cleanPricing,
          professions,
          years_experience: yearsExp ? Number(yearsExp) : null,
          ...(professions[0] ? { category_id: professions[0] } : {}),
          ...(provinceId ? { provincia_id: provinceId } : {}),
          ...(cantonId ? { canton_id: cantonId } : {}),
          address: address || null,
        })
        .eq("id", professionalId);

      if (proError) throw proError;

      // Photo is auto-saved on selection; here we only persist the name.
      if (fullName) {
        await supabase.from("profiles").update({ full_name: fullName }).eq("id", profileId);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      onSaved?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-lg">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Photo */}
      <div className="flex items-center gap-4">
        <div
          className="relative h-20 w-20 rounded-full cursor-pointer group shrink-0"
          onClick={() => photoInputRef.current?.click()}
        >
          {avatarPreview ? (
            <img
              src={avatarPreview}
              alt="Foto de perfil"
              className="h-20 w-20 rounded-full object-cover border-2 border-[#e5e7eb]"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-[#EBF5FB] border-2 border-dashed border-[#bfdbfe] flex items-center justify-center">
              <Camera className="h-7 w-7 text-[#009FD9]" />
            </div>
          )}
          <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Camera className="h-4 w-4 text-white" />
          </div>
          {photoUploading && (
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
              <span className="h-5 w-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-[#374151]">Foto de perfil</p>
          <p className="text-xs text-[#9ca3af]">
            {photoUploading ? "Subiendo foto…" : "Se guarda al instante · JPG, PNG o WebP · máx 5 MB"}
          </p>
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoSelect(f); }}
        />
      </div>

      {/* Name */}
      <Input
        label="Nombre completo"
        value={fullName}
        onChange={(e) => { setFullName(e.target.value); setSaved(false); }}
        placeholder="Juan Pérez González"
      />

      {/* Description */}
      <div>
        <label className="text-sm font-medium text-[#374151] block mb-1.5">Descripción</label>
        <textarea
          className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[120px] resize-none focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
          placeholder="Describí tu experiencia, especialidades y qué te diferencia…"
          value={bio}
          onChange={(e) => { setBio(e.target.value); setSaved(false); }}
        />
      </div>

      {/* Categories — multi-select (first is the primary/principal) */}
      <div>
        <label className="text-sm font-medium text-[#374151] block mb-1.5">Categorías / servicios</label>
        {professions.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {professions.map((p, i) => (
              <span key={p} className="inline-flex items-center gap-1.5 rounded-lg bg-[#EBF5FB] text-[#0089bb] text-sm font-medium pl-3 pr-1.5 py-1.5">
                {getCategoryLabel(p)}
                {i === 0 && <span className="text-[10px] font-bold uppercase tracking-wide text-[#009FD9]/70">Principal</span>}
                {professions.length > 1 && (
                  <button type="button" onClick={() => removeProfession(p)} className="rounded-md p-0.5 hover:bg-[#009FD9]/20 transition-colors" aria-label="Quitar">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        <CategorySearch
          value={addCat}
          onChange={(v) => addProfession(v)}
          placeholder="Agregá una categoría… ej. plomero, fotógrafo"
        />
      </div>

      {/* WhatsApp */}
      <Input
        label="WhatsApp (sin +506)"
        placeholder="88001122"
        value={whatsapp}
        onChange={(e) => { setWhatsapp(e.target.value); setSaved(false); }}
      />

      {/* Location */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-[#374151] block mb-1.5">Provincia</label>
          <Select value={provinceId} onValueChange={(v) => { setProvinceId(v); setCantonId(""); setSaved(false); }}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccioná" />
            </SelectTrigger>
            <SelectContent>
              {PROVINCES.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium text-[#374151] block mb-1.5">Cantón</label>
          <Select
            value={cantonId}
            disabled={!provinceId}
            onValueChange={(v) => { setCantonId(v); setSaved(false); }}
          >
            <SelectTrigger>
              <SelectValue placeholder={provinceId ? "Seleccioná" : "Primero provincia"} />
            </SelectTrigger>
            <SelectContent>
              {cantons.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Input
        label="Dirección (opcional)"
        placeholder="Ej: Barrio Escalante, San José"
        value={address}
        onChange={(e) => { setAddress(e.target.value); setSaved(false); }}
      />

      {/* Pricing tiers */}
      <div>
        <label className="text-sm font-medium text-[#374151] block mb-1.5">Precios</label>
        <div className="flex flex-col gap-2">
          {pricing.map((tier) => (
            <div key={tier.id} className="flex items-center gap-2">
              <select
                value={tier.type}
                onChange={(e) => updateTier(tier.id, { type: e.target.value as PricingType })}
                className="h-10 px-3 rounded-xl border border-[#e5e7eb] bg-white text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
              >
                {PRICING_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>{pt.label}</option>
                ))}
              </select>
              {tier.type !== "a_convenir" && (
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#9ca3af]">₡</span>
                  <input
                    type="number"
                    placeholder="10000"
                    value={tier.amount ?? ""}
                    onChange={(e) => updateTier(tier.id, { amount: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full h-10 pl-7 pr-3 rounded-xl border border-[#e5e7eb] bg-white text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                  />
                </div>
              )}
              <button type="button" onClick={() => removeTier(tier.id)} className="h-9 w-9 rounded-lg flex items-center justify-center text-[#9ca3af] hover:text-red-500 hover:bg-red-50 transition-colors shrink-0" aria-label="Quitar tarifa">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={addTier} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#009FD9] hover:underline self-start">
            <Plus className="h-4 w-4" /> Agregar tarifa
          </button>
        </div>
      </div>

      {/* Experience */}
      <Input
        label="Años de experiencia"
        type="number"
        placeholder="5"
        value={yearsExp}
        onChange={(e) => { setYearsExp(e.target.value); setSaved(false); }}
        className="max-w-[200px]"
      />

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={saving}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-600 font-medium">
            <Check className="h-4 w-4" /> Guardado
          </span>
        )}
      </div>
    </div>
  );
}
