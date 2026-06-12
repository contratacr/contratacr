"use client";

import { useState, useRef, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { UnsavedChangesGuard } from "@/components/dashboard/unsaved-changes-guard";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { LanguagesInput } from "@/components/ui/languages-input";
import { WorkplacesPicker, type Workplace } from "@/components/maps/workplaces-picker";
import { CoverageAreaSelector } from "@/components/maps/coverage-area-selector";
import { createClient } from "@/lib/supabase/client";
import { Camera, Check, X, Plus, Truck, MapPin, ChevronDown, Globe, ShieldCheck, Lock, Award, Info } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { computeSearchAreas, primaryArea, type CoverageArea } from "@/lib/location";
import { AseguradorasInput } from "@/components/ui/aseguradoras-input";
import { CloseAccountSection } from "@/components/account/close-account-section";
import { CategorySearch } from "@/components/ui/category-search";
import { getCategoryLabel, anyHealthCategory } from "@/lib/data/categories";
import type { Certification } from "@/components/professionals/professional-card";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProData = Record<string, any>;

interface ProfileEditorProps {
  professionalId: string;
  profileId: string;
  initial: ProData;
  onSaved?: () => void;
}

// Collapsible section — groups the long profile form into digestible blocks so
// it's quick to scan and edit. Presentation only; all fields still live in the
// same form/state and save identically.
function Section({ title, desc, defaultOpen = false, children }: { title: string; desc?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#fafafa] transition-colors"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#111827]">{title}</p>
          {desc && <p className="text-xs text-[#9ca3af] mt-0.5">{desc}</p>}
        </div>
        <ChevronDown className={cn("h-4 w-4 text-[#9ca3af] shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="px-4 pb-4 pt-1 flex flex-col gap-4 border-t border-[#f3f4f6]">{children}</div>}
    </div>
  );
}

export function ProfileEditor({ professionalId, profileId, initial, onSaved }: ProfileEditorProps) {
  const locale = useLocale();
  const t = useTranslations("profileEditor");
  const rich = { strong: (c: React.ReactNode) => <strong>{c}</strong> };
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [bio, setBio] = useState<string>(initial.bio ?? "");
  const [whatsapp, setWhatsapp] = useState<string>(initial.whatsapp ?? "");
  // Optional SEPARATE number for calls. Empty → the WhatsApp number is used for calls.
  const [callPhone, setCallPhone] = useState<string>(initial.call_phone ?? "");
  const [contactEmail, setContactEmail] = useState<string>(initial.contact_email ?? "");
  const [fullName, setFullName] = useState<string>(initial.profiles?.full_name ?? "");
  // The official name is locked once verified — it's what backs the "Identidad
  // verificada" badge (the guarantee it matches the padrón). Corrections go
  // through admin review, not a free edit. The commercial name stays editable.
  const nameLocked = (initial.verification_status as string) === "verified";
  const seedProfessions: string[] =
    Array.isArray(initial.professions) && initial.professions.length > 0
      ? initial.professions
      : initial.category_id ? [initial.category_id] : [];
  const [professions, setProfessions] = useState<string[]>(seedProfessions);
  // Aseguradoras only apply to health (es_salud) professionals.
  const isHealthPro = anyHealthCategory(professions);
  const [addCat, setAddCat] = useState("");
  const [addingProf, setAddingProf] = useState(false);
  const [coverageAreas, setCoverageAreas] = useState<CoverageArea[]>(
    Array.isArray(initial.coverage_areas) ? initial.coverage_areas : []
  );
  const [address, setAddress] = useState<string>(initial.address ?? "");
  const [businessName, setBusinessName] = useState<string>(initial.business_name ?? "");
  const [workplaces, setWorkplaces] = useState<Workplace[]>(Array.isArray(initial.workplaces) ? initial.workplaces : []);
  // Default to "Español" (most professionals) so a Spanish-only pro is never
  // treated as "missing" languages. Extra languages are an optional bonus.
  const [languages, setLanguages] = useState<string[]>(
    Array.isArray(initial.languages) && initial.languages.length > 0 ? initial.languages : ["Español"]
  );
  const [insurers, setInsurers] = useState<string[]>(Array.isArray(initial.insurance_networks) ? initial.insurance_networks : []);
  // Certifications — TEXT entries only (no images): nombre + institución + año.
  const [certifications, setCertifications] = useState<Certification[]>(
    Array.isArray(initial.certifications) ? initial.certifications : []
  );
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
  function addCertification(profession?: string) {
    setCertifications((prev) => [...prev, { id: `ct_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: "", institution: "", year: "", profession }]);
    touch();
  }
  function updateCertification(id: string, patch: Partial<Certification>) {
    setCertifications((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    touch();
  }
  function removeCertification(id: string) {
    setCertifications((prev) => prev.filter((c) => c.id !== id));
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
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || t("photoError"));
      }
      const { url } = await res.json();
      const supabase = createClient();
      const { error: upErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", profileId);
      if (upErr) throw new Error(t("photoError"));
      await supabase.auth.updateUser({ data: { avatar_url: url } });
      setAvatarPreview(url);
      onSaved?.();
    } catch (e) {
      // Revert the optimistic preview and show the specific reason (size/format).
      setAvatarPreview(initial.profiles?.avatar_url ?? null);
      setError(e instanceof Error && e.message ? e.message : t("photoError"));
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
      // Price is set per-service in the Servicios tab now (single source of truth).
      // Mi perfil no longer writes `pricing`/`hourly_rate` — existing DB values are
      // left untouched as a display fallback for pros who haven't moved over yet.

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
        call_phone: callPhone.trim() || null,
        contact_email: contactEmail.trim() || null,
      };

      let { error: proError } = await supabase
        .from("professionals")
        .update({ ...baseUpdate, ...identityFields })
        .eq("id", professionalId);
      // Retry without the optional identity columns if the DB isn't migrated yet.
      if (proError && /business_name|workplaces|coverage_areas|search_provincias|search_cantones|insurance_networks|call_phone|contact_email|affiliations|schema cache|could not find|PGRST204/i.test(proError.message)) {
        ({ error: proError } = await supabase.from("professionals").update(baseUpdate).eq("id", professionalId));
      }

      if (proError) throw proError;

      // Persist certifications in their OWN update so an unrelated optional column
      // can never drop them (that was the "not saving" bug). Each keeps its
      // profession tag. Errors here (column not migrated) are non-fatal.
      const cleanCerts = certifications
        .filter((c) => c.name?.trim())
        .map((c) => ({
          id: c.id,
          name: c.name.trim(),
          institution: c.institution?.trim() || undefined,
          year: c.year?.trim() || undefined,
          // Default an untagged cert to the principal profession so it has a home.
          profession: c.profession || professions[0] || undefined,
        }));
      await supabase.from("professionals").update({ certifications: cleanCerts }).eq("id", professionalId);

      // Persist the personal/display name — but NEVER overwrite a verified
      // official name (it's locked; corrections go through admin review).
      if (fullName && !nameLocked) {
        await supabase.from("profiles").update({ full_name: fullName }).eq("id", profileId);
        // Mirror into auth metadata so the header/menu (which read
        // user_metadata.full_name) update IMMEDIATELY — updateUser fires
        // onAuthStateChange (USER_UPDATED), which useAuth subscribes to. No reload.
        await supabase.auth.updateUser({ data: { full_name: fullName } });
      }

      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved((_p) => false), 3000);
      onSaved?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setSaving(false);
      setAutoSaving(false);
    }
  }

  const hasCountryCoverage = coverageAreas.some((a) => (a.level ?? "canton") === "country");
  const hasNarrowerCoverage = coverageAreas.some((a) => (a.level ?? "canton") !== "country");

  return (
    <div className="flex flex-col gap-3 max-w-lg">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ── Datos básicos ─────────────────────────────────────────────── */}
      <Section title={t("secBasic")} desc={t("secBasicDesc")} defaultOpen>
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
            <p className="text-sm font-medium text-[#374151]">{t("profilePhoto")}</p>
            {avatarPreview ? (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()}>
                  <Camera className="h-4 w-4" /> {t("changePhoto")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handlePhotoRemove} className="border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600">
                  <X className="h-4 w-4" /> {t("remove")}
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()}>
                <Camera className="h-4 w-4" /> {t("addPhoto")}
              </Button>
            )}
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoSelect(f); }}
          />
        </div>

        {/* Official name — locked once verified (backs the verified badge) */}
        {nameLocked ? (
          <div>
            <Input
              label={
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  {t("fullName")}
                  <span className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 text-[11px] font-semibold text-[#16a34a]"><ShieldCheck className="h-3.5 w-3.5 shrink-0" /> {t("identityVerified")}</span>
                </span>
              }
              value={fullName}
              disabled
              rightIcon={<Lock className="h-4 w-4" />}
            />
            <p className="text-xs text-[#6b7280] mt-1.5">
              {t.rich("nameLockedHelp", { ...rich, link: (c) => <Link href="/soporte" className="text-[#009FD9] font-medium hover:underline">{c}</Link> })}
            </p>
          </div>
        ) : (
          <Input
            label={<>{t("fullName")} <span className="text-red-500">*</span></>}
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); touch(); }}
            placeholder={t("fullNamePlaceholder")}
          />
        )}

        {/* Brand / business name — optional */}
        <div>
          <Input
            label={<>{t("businessName")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span></>}
            value={businessName}
            onChange={(e) => { setBusinessName(e.target.value); touch(); }}
            placeholder={t("businessPlaceholder")}
          />
          <p className="text-xs text-[#9ca3af] mt-1.5">{t("businessHelp")}</p>
        </div>

        {/* Description */}
        <div>
          <label className="text-sm font-medium text-[#374151] block mb-1.5">{t("description")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span></label>
          <textarea
            className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[110px] resize-none focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
            placeholder={t("descPlaceholder")}
            value={bio}
            onChange={(e) => { setBio(e.target.value); touch(); }}
          />
        </div>
      </Section>

      {/* ── Profesión ─────────────────────────────────────────────────── */}
      <Section title={t("secProfessions")} desc={t("secProfessionsDesc")} defaultOpen>
        {/* Professions — multi-select (first is the primary/principal). Each profesión
            groups the servicios managed in the Servicios tab. The "add" search is
            revealed on demand so the principal profession reads cleanly. */}
        <div>
          <p className="text-xs text-[#9ca3af] mb-2">{t.rich("professionsHelp", rich)}</p>
          {professions.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {professions.map((p, i) => (
                <span key={p} className="inline-flex items-center gap-1.5 rounded-lg bg-[#EBF5FB] text-[#0089bb] text-sm font-medium pl-3 pr-1.5 py-1.5">
                  {getCategoryLabel(p, locale)}
                  {i === 0 && <span className="text-[10px] font-bold uppercase tracking-wide text-[#009FD9]/70">{t("principal")}</span>}
                  {professions.length > 1 && (
                    <button type="button" onClick={() => removeProfession(p)} className="rounded-md p-0.5 hover:bg-[#009FD9]/20 transition-colors" aria-label="Quitar">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          {addingProf ? (
            <div className="flex flex-col gap-1.5">
              <CategorySearch
                value={addCat}
                onChange={(v) => { addProfession(v); setAddingProf(false); }}
                placeholder={t("searchProfession")}
              />
              <button type="button" onClick={() => setAddingProf(false)} className="self-start text-xs text-[#9ca3af] hover:text-[#374151]">{t("cancel")}</button>
            </div>
          ) : (
            <button type="button" onClick={() => setAddingProf(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#009FD9] hover:underline">
              <Plus className="h-4 w-4" /> {t("addAnotherProfession")}
            </button>
          )}
        </div>
      </Section>

      {/* ── Certificaciones (texto, sin imágenes) — POR PROFESIÓN ─────── */}
      <Section title={t("secCerts")} desc={t("secCertsDesc")}>
        <p className="text-xs text-[#9ca3af]">
          {t.rich("certsHelp", rich)}
        </p>
        {(professions.length > 0 ? professions : [""]).map((prof) => {
          // A cert belongs to `prof` when tagged so; legacy untagged certs fall
          // under the principal profession.
          const certsForProf = certifications.filter((c) => (c.profession || professions[0] || "") === prof);
          return (
            <div key={prof || "general"} className="flex flex-col gap-2.5 border-t border-[#f3f4f6] pt-3 first:border-t-0 first:pt-0">
              {professions.length > 1 && prof && (
                <p className="text-xs font-bold uppercase tracking-wide text-[#0089bb]">{getCategoryLabel(prof, locale)}</p>
              )}
              {certsForProf.map((c) => (
                <div key={c.id} className="rounded-xl border border-[#e5e7eb] p-3 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <Award className="h-4 w-4 text-[#009FD9] mt-2.5 shrink-0" />
                    <input
                      type="text"
                      value={c.name}
                      onChange={(e) => updateCertification(c.id!, { name: e.target.value })}
                      placeholder={t("certNamePlaceholder")}
                      className="flex-1 h-10 rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                    />
                    <button type="button" onClick={() => removeCertification(c.id!)} className="h-9 w-9 rounded-lg flex items-center justify-center text-[#9ca3af] hover:text-red-500 hover:bg-red-50 transition-colors shrink-0" aria-label={t("certRemove")}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr,7rem] gap-2 pl-6">
                    <input
                      type="text"
                      value={c.institution ?? ""}
                      onChange={(e) => updateCertification(c.id!, { institution: e.target.value })}
                      placeholder={t("certInstitution")}
                      className="h-10 rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={c.year ?? ""}
                      onChange={(e) => updateCertification(c.id!, { year: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                      placeholder={t("certYear")}
                      className="h-10 rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                    />
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => addCertification(prof || undefined)} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#009FD9] hover:underline self-start">
                <Plus className="h-4 w-4" /> {professions.length > 1 && prof ? t("addCertTo", { profession: getCategoryLabel(prof, locale) }) : t("addCert")}
              </button>
            </div>
          );
        })}
      </Section>

      {/* ── Ubicación y cobertura ─────────────────────────────────────── */}
      <Section title={t("secLocation")} desc={t("secLocationDesc")}>
        {/* Work mode — both can be selected (travels AND has fixed locations) */}
        <div>
          <label className="text-sm font-medium text-[#374151] block mb-2">{t("howOffer")} <span className="text-red-500">*</span> <span className="text-[#9ca3af] font-normal">{t("chooseBoth")}</span></label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: "mobile", icon: Truck, title: t("mobileTitle"), desc: t("mobileDesc"), active: serviceMobile, toggle: () => { setServiceMobile((v) => !v); touch(); } },
              { id: "fixed", icon: MapPin, title: t("fixedTitle"), desc: t("fixedDesc"), active: serviceFixed, toggle: () => { setServiceFixed((v) => !v); touch(); } },
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

        {/* The matching location block(s) live in one soft grouped panel right
            under the work-mode choice — connected, no extra hard borders. */}
        {(serviceFixed || serviceMobile) && (
          <div className="rounded-xl bg-[#f9fafb] p-3.5 flex flex-col gap-4">
            {serviceFixed && (
              <div>
                <label className="text-sm font-semibold text-[#111827] flex items-center gap-1.5 mb-1">
                  <MapPin className="h-4 w-4 text-[#009FD9]" /> {t("workplaces")}
                </label>
                <p className="text-xs text-[#9ca3af] mb-2">
                  {t.rich("workplacesHelp", rich)}
                </p>
                <WorkplacesPicker value={workplaces} onChange={(next) => { setWorkplaces(next); touch(); }} mapHeight={168} />
              </div>
            )}

            {serviceMobile && (
              <div>
                <label className="text-sm font-semibold text-[#111827] flex items-center gap-1.5 mb-1">
                  <Truck className="h-4 w-4 text-[#009FD9]" /> {t("coverageAreas")}
                </label>
                <p className="text-xs text-[#9ca3af] mb-2">
                  {t("coverageHelp")}
                </p>
                {hasCountryCoverage && hasNarrowerCoverage && (
                  <div className="flex items-start gap-2 rounded-lg bg-[#fffbeb] border border-[#fde68a] px-3 py-2 mb-2 text-xs text-[#92400e]">
                    <Globe className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{t.rich("countryCoverageWarn", rich)}</span>
                  </div>
                )}
                <CoverageAreaSelector value={coverageAreas} onChange={(next) => { setCoverageAreas(next); touch(); }} />
              </div>
            )}
          </div>
        )}

        <Input
          label={<>{t("address")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span></>}
          placeholder={t("addressPlaceholder")}
          value={address}
          onChange={(e) => { setAddress(e.target.value); touch(); }}
        />
      </Section>

      {/* ── Contacto y precios ────────────────────────────────────────── */}
      <Section title={t("secContact")} desc={t("secContactDesc")}>
        {/* WhatsApp — required contact channel */}
        <PhoneInput
          label={t("whatsapp")}
          required
          value={whatsapp}
          onChange={(digits) => { setWhatsapp(digits); touch(); }}
        />

        {/* Optional SEPARATE call number — for pros who use a different line for
            calls. Empty → the WhatsApp number is used for calls too. */}
        <div>
          <PhoneInput
            label={<>{t("callNumber")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span></>}
            value={callPhone}
            onChange={(digits) => { setCallPhone(digits); touch(); }}
          />
          <p className="text-xs text-[#9ca3af] mt-1">{t("callHelp")}</p>
        </div>

        {/* Optional public contact email — opt-in; shown to clients who prefer
            email. Hidden on the profile when empty. */}
        <div>
          <label className="text-sm font-medium text-[#374151] block mb-1.5">
            {t("contactEmail")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
          </label>
          <input
            type="email"
            inputMode="email"
            placeholder={t("emailPlaceholder")}
            value={contactEmail}
            onChange={(e) => { setContactEmail(e.target.value); touch(); }}
            className="w-full h-11 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
          />
          {contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim()) ? (
            <p className="text-xs text-red-500 mt-1">{t("emailInvalid")}</p>
          ) : (
            <p className="text-xs text-[#9ca3af] mt-1">{t("emailHelp")}</p>
          )}
        </div>

        {/* Price lives in Servicios now — one place only, to avoid confusion. */}
        <div className="rounded-xl bg-[#f4f7fa] border border-[#e5e7eb] p-3.5 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-[#009FD9] shrink-0 mt-0.5" />
          <p className="text-xs text-[#6b7280] leading-relaxed">
            {t.rich("priceNote", rich)}
          </p>
        </div>
        {/* Experience is captured per service (in the Servicios tab), not globally. */}
      </Section>

      {/* ── Idiomas (+ aseguradoras only for health pros) ─────────────────
          Aseguradoras only apply to HEALTH categories (es_salud) — a plumber
          has nothing to do with insurance, so we hide the field entirely for
          non-health pros (it isn't part of their profile at all). */}
      <Section title={isHealthPro ? t("secLangInsurers") : t("secLang")} desc={t("secLangDesc")}>
        {/* Languages — defaults to Español; extra languages are an optional bonus */}
        <div>
          <label className="text-sm font-medium text-[#374151] block mb-1.5">
            {t("languagesSpoken")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
          </label>
          <LanguagesInput value={languages} onChange={(next) => { setLanguages(next); touch(); }} />
        </div>

        {/* Aseguradoras — ONLY for health (es_salud) professionals */}
        {isHealthPro && (
          <div>
            <label className="text-sm font-medium text-[#374151] block mb-1.5">
              {t("insurers")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
            </label>
            <p className="text-xs text-[#9ca3af] mb-2">{t("insurersHelp")}</p>
            <AseguradorasInput value={insurers} onChange={(next) => { setInsurers(next); touch(); }} />
          </div>
        )}
      </Section>

      {/* Contact preference lives in the Disponibilidad tab now. */}

      {/* Save bar — always visible (auto-save also runs 1.5s after each edit) */}
      <div className="flex items-center gap-3 pt-1">
        <Button onClick={() => handleSave(false)} loading={saving}>
          {saving ? t("saving") : t("save")}
        </Button>
        {autoSaving && (
          <span className="text-sm text-[#6b7280] font-medium">{t("savingAuto")}</span>
        )}
        {!autoSaving && dirty && !saved && (
          <span className="text-sm text-amber-600 font-medium">{t("unsaved")}</span>
        )}
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-600 font-medium">
            <Check className="h-4 w-4" /> {t("saved")}
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
