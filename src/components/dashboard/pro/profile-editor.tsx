"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { UnsavedChangesGuard } from "@/components/dashboard/unsaved-changes-guard";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { LanguagesInput } from "@/components/ui/languages-input";
import { PriceInput } from "@/components/ui/price-input";
import { WorkplacesPicker, type Workplace } from "@/components/maps/workplaces-picker";
import { CoverageAreaSelector } from "@/components/maps/coverage-area-selector";
import { createClient } from "@/lib/supabase/client";
import { Camera, Check, X, Plus, Truck, MapPin } from "lucide-react";
import { computeSearchAreas, primaryArea, type CoverageArea } from "@/lib/location";
import { AseguradorasInput } from "@/components/ui/aseguradoras-input";
import { CloseAccountSection } from "@/components/account/close-account-section";
import { CategorySearch } from "@/components/ui/category-search";
import { getCategoryLabel } from "@/lib/data/categories";
import { cn } from "@/lib/utils";
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
  const [coverageAreas, setCoverageAreas] = useState<CoverageArea[]>(
    Array.isArray(initial.coverage_areas) ? initial.coverage_areas : []
  );
  const [address, setAddress] = useState<string>(initial.address ?? "");
  const [businessName, setBusinessName] = useState<string>(initial.business_name ?? "");
  const [workplaces, setWorkplaces] = useState<Workplace[]>(Array.isArray(initial.workplaces) ? initial.workplaces : []);
  const [languages, setLanguages] = useState<string[]>(Array.isArray(initial.languages) ? initial.languages : []);
  const [insurers, setInsurers] = useState<string[]>(Array.isArray(initial.insurance_networks) ? initial.insurance_networks : []);
  // Work mode — BOTH can be selected (travels AND has fixed locations).
  const initialTypes = String(initial.service_type ?? "mobile");
  const [serviceMobile, setServiceMobile] = useState(initialTypes.includes("mobile") || initialTypes === "");
  const [serviceFixed, setServiceFixed] = useState(initialTypes.includes("fixed"));
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    initial.profiles?.avatar_url ?? null
  );
  const [photoUploading, setPhotoUploading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [autoNonce, setAutoNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Single helper so every field marks the form dirty + clears the saved flag,
  // and schedules an auto-save (the nonce drives the debounce effect below).
  function touch() { setSaved((_p) => false); setDirty(true); setAutoNonce((n) => n + 1); }

  // Auto-save: 1.5s after the last edit we persist silently, so leaving rarely
  // needs the unsaved-changes dialog at all. The dialog is the safety net only
  // for the brief window before the debounce fires (or if a save fails).
  useEffect(() => {
    if (autoNonce === 0 || !dirty) return;
    const t = setTimeout(() => { handleSave(true); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoNonce]);

  function addProfession(id: string) {
    if (!id || professions.includes(id)) { setAddCat(""); return; }
    setProfessions((prev) => [...prev, id]);
    setAddCat("");
    touch();
  }
  function removeProfession(id: string) {
    setProfessions((prev) => (prev.length > 1 ? prev.filter((p) => p !== id) : prev));
    touch();
  }
  function addTier() {
    setPricing((prev) => [...prev, { id: `pr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, type: "por_hora", amount: undefined }]);
    touch();
  }
  function updateTier(id: string, patch: Partial<PricingTier>) {
    setPricing((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    touch();
  }
  function removeTier(id: string) {
    setPricing((prev) => prev.filter((p) => p.id !== id));
    touch();
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
      fd.append("type", "avatar");
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

  async function handlePhotoRemove() {
    setError(null);
    setAvatarPreview(null);
    const supabase = createClient();
    await supabase.from("profiles").update({ avatar_url: null }).eq("id", profileId);
    await supabase.auth.updateUser({ data: { avatar_url: null } });
    onSaved?.();
  }

  async function handleSave(auto = false) {
    if (auto) setAutoSaving(true); else setSaving(true);
    setError(null);
    const supabase = createClient();

    try {
      // Keep legacy hourly_rate in sync with a "por_hora" tier for back-compat.
      const hourTier = pricing.find((p) => p.type === "por_hora" && p.amount);
      const cleanPricing = pricing
        .filter((p) => p.type === "a_convenir" || p.amount != null)
        .map((p) => ({ ...p, amount: p.type === "a_convenir" ? undefined : p.amount }));

      // Only keep workplaces when "fixed" is selected; coverage when "mobile".
      const effectiveWorkplaces = serviceFixed ? workplaces : [];
      const effectiveCoverage = serviceMobile ? coverageAreas : [];
      const serviceType = [serviceMobile ? "mobile" : null, serviceFixed ? "fixed" : null].filter(Boolean).join(",") || "mobile";

      // Location is derived from pins (fixed) + coverage areas (mobile) — the
      // single source of truth. provincia_id/canton_id keep the PRIMARY area for
      // back-compat display; search_* arrays drive location-aware /buscar.
      const { provincias, cantones, coverageProvincias, coverageCountry } = computeSearchAreas(effectiveWorkplaces, effectiveCoverage);
      const primary = primaryArea(effectiveWorkplaces, effectiveCoverage);

      const baseUpdate: Record<string, unknown> = {
        bio,
        whatsapp,
        hourly_rate: hourTier?.amount ?? null,
        pricing: cleanPricing,
        professions,
        languages,
        service_type: serviceType,
        ...(professions[0] ? { category_id: professions[0] } : {}),
        provincia_id: primary.provinciaId ?? null,
        canton_id: primary.cantonId ?? null,
        address: address || null,
        lat: effectiveWorkplaces[0]?.lat ?? null,
        lng: effectiveWorkplaces[0]?.lng ?? null,
      };
      const identityFields = {
        business_name: businessName.trim() || null,
        workplaces: effectiveWorkplaces,
        coverage_areas: effectiveCoverage,
        search_provincias: provincias,
        search_cantones: cantones,
        coverage_provincias: coverageProvincias,
        coverage_country: coverageCountry,
        insurance_networks: insurers,
      };

      let { error: proError } = await supabase
        .from("professionals")
        .update({ ...baseUpdate, ...identityFields })
        .eq("id", professionalId);
      // Retry without the optional identity columns if the DB isn't migrated yet.
      if (proError && /business_name|workplaces|coverage_areas|search_provincias|search_cantones|insurance_networks|affiliations|schema cache|could not find|PGRST204/i.test(proError.message)) {
        ({ error: proError } = await supabase.from("professionals").update(baseUpdate).eq("id", professionalId));
      }

      if (proError) throw proError;

      // Persist the professional's personal/display name.
      if (fullName) {
        await supabase.from("profiles").update({ full_name: fullName }).eq("id", profileId);
      }

      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved((_p) => false), 3000);
      onSaved?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
      setAutoSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-lg">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Photo — explicit buttons, no hover-to-change */}
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 rounded-full shrink-0">
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
          {photoUploading && (
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
              <span className="h-5 w-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-[#374151]">Foto de perfil</p>
          {avatarPreview ? (
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()}>
                <Camera className="h-4 w-4" /> Cambiar foto
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handlePhotoRemove} className="text-red-500 hover:text-red-600">
                <X className="h-4 w-4" /> Eliminar
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()}>
              <Camera className="h-4 w-4" /> Agregar foto
            </Button>
          )}
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoSelect(f); }}
        />
      </div>

      {/* Personal name — always your own name */}
      <Input
        label="Nombre completo"
        value={fullName}
        onChange={(e) => { setFullName(e.target.value); touch(); }}
        placeholder="Juan Pérez González"
      />

      {/* Brand / business name — optional */}
      <Input
        label={<>Nombre comercial o marca <span className="text-[#9ca3af] font-normal">(opcional)</span></>}
        value={businessName}
        onChange={(e) => { setBusinessName(e.target.value); touch(); }}
        placeholder="Ej: Servicios Eléctricos GAM"
      />

      {/* Work mode — both can be selected (travels AND has fixed locations) */}
      <div>
        <label className="text-sm font-medium text-[#374151] block mb-2">¿Cómo ofrecés tus servicios? <span className="text-[#9ca3af] font-normal">(podés elegir ambas)</span></label>
        <div className="grid grid-cols-2 gap-2">
          {([
            { id: "mobile", icon: Truck, title: "Me desplazo donde el cliente", desc: "Vas al lugar del cliente", active: serviceMobile, toggle: () => { setServiceMobile((v) => !v); touch(); } },
            { id: "fixed", icon: MapPin, title: "Trabajo desde un lugar fijo", desc: "Taller, consultorio, local", active: serviceFixed, toggle: () => { setServiceFixed((v) => !v); touch(); } },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={opt.toggle}
              className={cn(
                "flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-all",
                opt.active ? "border-[#009FD9] bg-[#EBF5FB]" : "border-[#e5e7eb] hover:border-[#009FD9]/40"
              )}
            >
              <opt.icon className="h-4 w-4 text-[#009FD9]" />
              <p className="text-sm font-medium text-[#111827]">{opt.title}</p>
              <p className="text-xs text-[#9ca3af]">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Fixed locations — pins are the single source of truth; provincia/cantón
          are derived from each pin (no manual selection). */}
      {serviceFixed && (
        <div>
          <label className="text-sm font-medium text-[#374151] block mb-1.5">
            Tus lugares de trabajo
          </label>
          <p className="text-xs text-[#9ca3af] mb-2">
            Marcá uno o más lugares en el mapa (o agregalos por provincia y cantón). Definen dónde
            aparecés cuando los clientes buscan profesionales.
          </p>
          <WorkplacesPicker value={workplaces} onChange={(next) => { setWorkplaces(next); touch(); }} />
        </div>
      )}

      {/* Coverage areas — only for "me desplazo": provincia+cantón pairs traveled to */}
      {serviceMobile && (
        <div>
          <label className="text-sm font-medium text-[#374151] block mb-1.5">
            Zonas a las que te desplazás
          </label>
          <p className="text-xs text-[#9ca3af] mb-2">
            Elegí las provincias y cantones donde atendés. Aparecés en los resultados de búsqueda de cada una.
          </p>
          <CoverageAreaSelector value={coverageAreas} onChange={(next) => { setCoverageAreas(next); touch(); }} />
        </div>
      )}

      {/* Description */}
      <div>
        <label className="text-sm font-medium text-[#374151] block mb-1.5">Descripción</label>
        <textarea
          className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[120px] resize-none focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
          placeholder="Describí tu experiencia, especialidades y qué te diferencia…"
          value={bio}
          onChange={(e) => { setBio(e.target.value); touch(); }}
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
      <PhoneInput
        label="WhatsApp"
        value={whatsapp}
        onChange={(digits) => { setWhatsapp(digits); touch(); }}
      />

      <Input
        label="Dirección (opcional)"
        placeholder="Ej: Barrio Escalante, San José"
        value={address}
        onChange={(e) => { setAddress(e.target.value); touch(); }}
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
                <div className="flex-1">
                  <PriceInput
                    placeholder="10000"
                    value={tier.amount != null ? String(tier.amount) : ""}
                    onChange={(v) => updateTier(tier.id, { amount: v ? Number(v) : undefined })}
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

      {/* Experience is captured per service (in the Servicios tab), not globally. */}

      {/* Languages — optional chip autocomplete (full language list) */}
      <div>
        <label className="text-sm font-medium text-[#374151] block mb-1.5">
          Idiomas que hablás <span className="text-[#9ca3af] font-normal">(opcional)</span>
        </label>
        <LanguagesInput value={languages} onChange={(next) => { setLanguages(next); touch(); }} />
      </div>

      {/* Aseguradoras — insurance networks the pro belongs to */}
      <div>
        <label className="text-sm font-medium text-[#374151] block mb-1.5">
          Aseguradoras <span className="text-[#9ca3af] font-normal">(opcional)</span>
        </label>
        <p className="text-xs text-[#9ca3af] mb-2">Marcá las redes de seguros con las que trabajás. Los clientes pueden filtrar por aseguradora.</p>
        <AseguradorasInput value={insurers} onChange={(next) => { setInsurers(next); touch(); }} />
      </div>

      {/* Contact preference lives in the Disponibilidad tab now. */}

      <div className="flex items-center gap-3">
        <Button onClick={() => handleSave(false)} loading={saving}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
        {autoSaving && (
          <span className="text-sm text-[#6b7280] font-medium">Guardando automáticamente…</span>
        )}
        {!autoSaving && dirty && !saved && (
          <span className="text-sm text-amber-600 font-medium">Cambios sin guardar</span>
        )}
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-600 font-medium">
            <Check className="h-4 w-4" /> Guardado
          </span>
        )}
      </div>

      {/* Cerrar / deshabilitar cuenta */}
      <CloseAccountSection />

      {/* Designed unsaved-changes dialog (replaces the browser default) */}
      <UnsavedChangesGuard dirty={dirty} onSave={() => handleSave(false)} />
    </div>
  );
}
