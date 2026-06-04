"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { Camera, Check } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PROVINCES, getCantonsByProvince } from "@/lib/data/cr-geography";
import { CategorySearch } from "@/components/ui/category-search";

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
  const [hourlyRate, setHourlyRate] = useState(String(initial.hourly_rate ?? ""));
  const [yearsExp, setYearsExp] = useState(String(initial.years_experience ?? ""));
  const [fullName, setFullName] = useState<string>(initial.profiles?.full_name ?? "");
  const [categoryId, setCategoryId] = useState<string>(initial.category_id ?? "");
  const [provinceId, setProvinceId] = useState<string>(initial.provincia_id ?? "");
  const [cantonId, setCantonId] = useState<string>(initial.canton_id ?? "");
  const [address, setAddress] = useState<string>(initial.address ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    initial.profiles?.avatar_url ?? null
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cantons = getCantonsByProvince(provinceId);

  function handlePhotoSelect(file: File) {
    setPhotoFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const supabase = createClient();

    try {
      let avatarUrl: string | undefined;
      if (photoFile) {
        const fd = new FormData();
        fd.append("file", photoFile);
        const res = await fetch("/api/upload/photo", { method: "POST", body: fd });
        if (res.ok) {
          const { url } = await res.json();
          avatarUrl = url;
        }
      }

      const { error: proError } = await supabase
        .from("professionals")
        .update({
          bio,
          whatsapp,
          hourly_rate: hourlyRate ? Number(hourlyRate) : null,
          years_experience: yearsExp ? Number(yearsExp) : null,
          ...(categoryId ? { category_id: categoryId } : {}),
          ...(provinceId ? { provincia_id: provinceId } : {}),
          ...(cantonId ? { canton_id: cantonId } : {}),
          address: address || null,
        })
        .eq("id", professionalId);

      if (proError) throw proError;

      const profileUpdate: Record<string, string> = {};
      if (fullName) profileUpdate.full_name = fullName;
      if (avatarUrl) profileUpdate.avatar_url = avatarUrl;

      if (Object.keys(profileUpdate).length) {
        await supabase.from("profiles").update(profileUpdate).eq("id", profileId);
      }

      if (avatarUrl) {
        await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } });
        setPhotoFile(null);
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
        </div>
        <div>
          <p className="text-sm font-medium text-[#374151]">Foto de perfil</p>
          <p className="text-xs text-[#9ca3af]">JPG, PNG o WebP · máx 5 MB</p>
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

      {/* Service — searchable combobox */}
      <div>
        <label className="text-sm font-medium text-[#374151] block mb-1.5">Servicio principal</label>
        <CategorySearch
          value={categoryId}
          onChange={(v) => { setCategoryId(v); setSaved(false); }}
          placeholder="Buscá tu especialidad…"
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

      {/* Rates */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Tarifa por hora (₡)"
          type="number"
          placeholder="10000"
          value={hourlyRate}
          onChange={(e) => { setHourlyRate(e.target.value); setSaved(false); }}
        />
        <Input
          label="Años de experiencia"
          type="number"
          placeholder="5"
          value={yearsExp}
          onChange={(e) => { setYearsExp(e.target.value); setSaved(false); }}
        />
      </div>

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
