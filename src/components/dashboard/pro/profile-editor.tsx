"use client";

import { useState, useRef, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { UnsavedChangesGuard } from "@/components/dashboard/unsaved-changes-guard";
import { useReportSaveStatus } from "@/components/dashboard/save-status-context";
import { Input } from "@/components/ui/input";
import { ImagePreviewDialog } from "@/components/ui/image-preview-dialog";
import { PhoneInput } from "@/components/ui/phone-input";
import { LanguagesInput } from "@/components/ui/languages-input";
import { WorkplacesPicker, type Workplace } from "@/components/maps/workplaces-picker";
import { IMAGE_ACCEPT } from "@/lib/upload-validation";
import { getImageUploadPreparationErrorCode, prepareImageForUpload } from "@/lib/client-image-upload";
import { createClient } from "@/lib/supabase/client";
import { detectIdType } from "@/lib/cedula";
import { Camera, X, Plus, ChevronDown, Lock, Award, Globe, Video } from "lucide-react";
import { InstagramIcon, FacebookIcon, TikTokIcon, LinkedInIcon } from "@/components/icons/social-icons";
import { SOCIAL_NETWORKS, cleanUsername, cleanWebsiteUrl, isValidUsername, isValidWebsiteUrl, type SocialNetwork } from "@/lib/social";
import { Link } from "@/i18n/navigation";
import { computeSearchAreas, primaryArea } from "@/lib/location";
import { getProvinceById, getCantonById } from "@/lib/data/cr-geography";
import { AseguradorasInput } from "@/components/ui/aseguradoras-input";
import { getCategoryLabel, anyHealthCategory, anyVideoConsultCategory } from "@/lib/data/categories";
import { useCustomCategories } from "@/lib/data/use-custom-categories";
import type { Certification } from "@/components/professionals/professional-card";
import { cn } from "@/lib/utils";
import { NAME_MAX_LENGTH, PROFILE_BIO_MAX_LENGTH, SHORT_TEXT_MAX_LENGTH, limitText } from "@/lib/text-limits";
import { normalizeWorkplaceId } from "@/lib/workplaces";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProData = Record<string, any>;

interface ProfileEditorProps {
  professionalId: string;
  profileId: string;
  initial: ProData;
  onSaved?: () => void;
  /** A "Completa tu perfil" item the user clicked — opens the matching section
   *  and scrolls to the field. `focusKey` changes on every click so repeats fire. */
  focusField?: string | null;
  focusKey?: number;
  extraSections?: Array<{ id: string; title: string; desc?: string; children: React.ReactNode }>;
}

// "Completa tu perfil" field → which collapsible section holds it.
const FIELD_SECTION: Record<string, string> = {
  photo: "basic",
  bio: "basic",
  location: "location",
  whatsapp: "contact",
  insurers: "lang",
  verification: "verificacion",
};

// Collapsible section — groups the long profile form into digestible blocks so
// it's quick to scan and edit. Presentation only; all fields still live in the
// same form/state and save identically. CONTROLLED by the editor so a
// "Completa tu perfil" item can open the right section and scroll to its field.
function stableJson(value: Record<string, string>) {
  return JSON.stringify(Object.keys(value).sort().reduce<Record<string, string>>((acc, key) => {
    acc[key] = value[key];
    return acc;
  }, {}));
}

function Section({ id, title, desc, open, onToggle, children }: { id: string; title: string; desc?: string; open: boolean; onToggle: (id: string) => void; children: React.ReactNode }) {
  return (
    // A borderless ROW inside the shared settings card (the card + divide-y dividers live in
    // the editor's wrapper). Tappable header (white, hover tint) + an inline field area set
    // off by a hairline; the open header gets a faint tint so the active row is obvious.
    <div id={`sec-${id}`} className="scroll-mt-24">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className={cn("w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-4 text-left transition-colors", open ? "bg-[#fafafa]" : "hover:bg-[#fafafa]")}
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-[#111827] leading-tight">{title}</p>
          {desc && <p className="text-xs text-[#6b7280] mt-1">{desc}</p>}
        </div>
        <ChevronDown className={cn("h-5 w-5 text-[#9ca3af] shrink-0 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-4 sm:px-5 pb-5 pt-4 flex flex-col gap-4 border-t border-[#f3f4f6]">
          {children}
        </div>
      )}
    </div>
  );
}

// Back-compat: an existing pro's location may live in `workplaces` (current) or in
// legacy `coverage_areas` / primary `provincia_id`/`canton_id`. Seed the zone list
// from whatever exists so re-saving under the simplified model never drops their
// search presence. (Whole-province / whole-country legacy coverage isn't a zone, so
// it isn't seeded — the pro re-picks their cantón.)
function seedZones(init: ProData): Workplace[] {
  if (Array.isArray(init.workplaces) && init.workplaces.length > 0) return init.workplaces.map((wp, index) => normalizeWorkplaceId(wp, index));
  const out: Workplace[] = [];
  const cov = Array.isArray(init.coverage_areas) ? init.coverage_areas : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of cov as any[]) {
    const level = a.level ?? (a.cantonId ? "canton" : a.provinciaId ? "provincia" : "");
    if (level === "canton" && a.provinciaId && a.cantonId) {
      out.push({
        id: `wp_seed_${a.cantonId}`,
        name: [getCantonById(a.cantonId)?.name, getProvinceById(a.provinciaId)?.name].filter(Boolean).join(", "),
        address: "", provinciaId: a.provinciaId, cantonId: a.cantonId,
      });
    }
  }
  if (out.length === 0 && init.provincia_id && init.canton_id) {
    out.push({
      id: "wp_seed_primary",
      name: [getCantonById(init.canton_id)?.name, getProvinceById(init.provincia_id)?.name].filter(Boolean).join(", "),
      address: "", provinciaId: init.provincia_id, cantonId: init.canton_id,
    });
  }
  return out;
}

export function ProfileEditor({ professionalId, profileId, initial, onSaved, focusField, focusKey, extraSections = [] }: ProfileEditorProps) {
  const locale = useLocale();
  const t = useTranslations("profileEditor");
  const initialProfile = Array.isArray(initial.profiles) ? initial.profiles[0] : initial.profiles;
  const initialFullName = typeof initialProfile?.full_name === "string" ? initialProfile.full_name.trim() : "";
  const initialEmail = typeof initialProfile?.email === "string" ? initialProfile.email : "";
  const initialAvatarUrl = typeof initialProfile?.avatar_url === "string" ? initialProfile.avatar_url : null;
  // Which collapsible sections are open. Empty = all collapsed (default), so a
  // pro lands on a tidy, scannable list and opens what they want.
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const toggleSection = (id: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // A "Completa tu perfil" item was clicked → open its section, then scroll to
  // the exact field and flash it. focusKey changes per click so repeats re-fire.
  useEffect(() => {
    if (!focusField) return;
    const sec = FIELD_SECTION[focusField];
    const openTmr = sec ? setTimeout(() => setOpenSections((prev) => new Set(prev).add(sec)), 0) : null;
    const tmr = setTimeout(() => {
      const el = document.querySelector(`[data-field="${focusField}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("field-flash");
        setTimeout(() => el.classList.remove("field-flash"), 1600);
      } else if (sec) {
        const section = document.getElementById(`sec-${sec}`);
        section?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 160);
    return () => {
      if (openTmr) clearTimeout(openTmr);
      clearTimeout(tmr);
    };
  }, [focusField, focusKey]);
  const rich = { strong: (c: React.ReactNode) => <strong>{c}</strong> };
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [bio, setBio] = useState<string>(initial.bio ?? "");
  const [whatsapp, setWhatsapp] = useState<string>(initial.whatsapp ?? "");
  // Optional SEPARATE number for calls. Empty → the WhatsApp number is used for calls.
  const [callPhone, setCallPhone] = useState<string>(initial.call_phone ?? "");
  // "Permitir contacto por llamada" — moved here from Disponibilidad (it's a
  // contact setting). Saved with the rest of the profile.
  const [allowPhoneCall, setAllowPhoneCall] = useState<boolean>(!!initial.allow_phone_call);
  const accountEmail = initialEmail;
  const [contactEmail, setContactEmail] = useState<string>(initial.contact_email ?? accountEmail);
  // Optional public email is opt-in (toggle): on only if one is already saved.
  const [showContactEmail, setShowContactEmail] = useState<boolean>(!!initial.contact_email);
  // Optional social links — the pro types ONLY their username; we build the URL on
  // display. Stored as clean usernames. Seeded (and any legacy URL value cleaned)
  // from whatever is stored.
  const [social, setSocial] = useState<Record<SocialNetwork, string>>({
    instagram: cleanUsername(initial.social_links?.instagram),
    facebook: cleanUsername(initial.social_links?.facebook),
    tiktok: cleanUsername(initial.social_links?.tiktok),
    linkedin: cleanUsername(initial.social_links?.linkedin),
  });
  const [website, setWebsite] = useState<string>(cleanWebsiteUrl(initial.social_links?.website));
  const savedSocialLinksRef = useRef<Record<string, string>>({
    ...Object.fromEntries(
      SOCIAL_NETWORKS
        .map(({ key }) => [key, cleanUsername(initial.social_links?.[key])] as const)
        .filter(([, value]) => value)
    ),
    ...(cleanWebsiteUrl(initial.social_links?.website) ? { website: cleanWebsiteUrl(initial.social_links?.website) } : {}),
  });
  const [fullName, setFullName] = useState<string>(initialFullName);
  // The official name comes from the cédula entered at signup, so it's NOT editable here —
  // EXACTLY like the client account (which locks on a national cédula). We lock when the
  // pro is verified OR simply has a NATIONAL (padrón) cédula on file (fetched via the
  // owner-only get_my_profile RPC, since `cedula` isn't directly selectable). A DIMEX/NITE
  // or no cédula → manually-typed name → still editable (mirror of the client rule).
  // Corrections to a locked name go through soporte, not a free edit.
  const verified = (initial.verification_status as string) === "verified";
  const [hasNationalCedula, setHasNationalCedula] = useState(false);
  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("get_my_profile").then(({ data }) => {
      const ced = (data as { cedula?: string | null } | null)?.cedula;
      setHasNationalCedula(!!ced && detectIdType(String(ced)) === "cedula");
    });
  }, []);
  const nameLocked = verified || hasNationalCedula;
  const resolvedFullName = fullName.trim() || initialFullName;
  const seedProfessions: string[] =
    Array.isArray(initial.professions) && initial.professions.length > 0
      ? initial.professions
      : initial.category_id ? [initial.category_id] : [];
  // Read-only here — professions are managed in the "Profesiones" tab now.
  const professions = seedProfessions;
  // Loads admin-managed service flags (es_salud / videoconsulta) so optional
  // health-only fields also work for services added after deploy.
  useCustomCategories();
  // Aseguradoras only apply to health (es_salud) professionals.
  const isHealthPro = anyHealthCategory(professions);
  const canOfferVideoConsult = anyVideoConsultCategory(professions);
  // Address free-text field removed (provincia/cantón + optional pin cover it).
  // Keep the stored value so an existing address column isn't wiped on save.
  const address = (initial.address as string) ?? "";
  const [businessName, setBusinessName] = useState<string>(initial.business_name ?? "");
  const [publicBusinessNameOnly, setPublicBusinessNameOnly] = useState<boolean>(!!initial.business_name && initial.public_business_name_only === true);
  const publicBusinessNameOnlyRef = useRef(publicBusinessNameOnly);
  const [workplaces, setWorkplaces] = useState<Workplace[]>(() => seedZones(initial));
  // Default to "Español" (most professionals) so a Spanish-only pro is never
  // treated as "missing" languages. Extra languages are an optional bonus.
  const [languages, setLanguages] = useState<string[]>(
    Array.isArray(initial.languages) && initial.languages.length > 0 ? initial.languages : ["Español"]
  );
  const [insurers, setInsurers] = useState<string[]>(Array.isArray(initial.insurance_networks) ? initial.insurance_networks : []);
  // Certifications — text entries: nombre + institución + año (all required).
  const [certifications, setCertifications] = useState<Certification[]>(
    Array.isArray(initial.certifications) ? initial.certifications : []
  );
  // Draft being added (one at a time, per profession). null = no form open.
  const [certDraft, setCertDraft] = useState<{ profession?: string; name: string; institution: string; year: string } | null>(null);
  const [certError, setCertError] = useState<string | null>(null);
  const [videoConsult, setVideoConsult] = useState(!!initial.videoconsulta && canOfferVideoConsult);
  const [videoCoverageCountry, setVideoCoverageCountry] = useState(!!initial.coverage_country && canOfferVideoConsult);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    initialAvatarUrl
  );
  const [photoUploading, setPhotoUploading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasBusinessName = businessName.trim().length > 0;

  // ── App-wide RELIABLE autosave (the "Save standard"; see contratacr-context.md) ──
  // touch() marks dirty + debounces a save; flush() saves NOW (used on field blur);
  // and any pending save is FLUSHED on unmount. The unmount flush is the key
  // data-loss fix: switching dashboard tabs unmounts this editor, and firing the
  // pending save in cleanup (the fetch survives a same-page tab-switch unmount)
  // guarantees a change made right before leaving is never silently lost.
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashSeq = useRef(0);
  const dirtyRef = useRef(false);
  const saveRef = useRef<(auto?: boolean) => Promise<boolean>>(async () => true);
  const saveSeq = useRef(0);
  useEffect(() => {
    saveRef.current = handleSave;
  });

  useEffect(() => {
    if (!dirtyRef.current && initialFullName && !fullName.trim()) {
      const tmr = window.setTimeout(() => setFullName(initialFullName), 0);
      return () => window.clearTimeout(tmr);
    }
  }, [initialFullName, fullName]);

  function touch() {
    if (savedTimer.current) {
      clearTimeout(savedTimer.current);
      savedTimer.current = null;
    }
    setSaved(false);
    setDirty(true);
    dirtyRef.current = true;
    if (autoTimer.current) clearTimeout(autoTimer.current);
    // Fire the LATEST handleSave via the ref — NOT this render's `handleSave`. `touch`
    // runs synchronously inside an onChange BEFORE React re-renders, so the `handleSave`
    // in scope here closes over PRE-change state. A discrete single edit (e.g. adding the
    // first workplace: [] → [A]) would otherwise autosave the stale value ([]), "succeed",
    // and clear `dirty` — so the new place was shown in the UI but never persisted (the
    // real "Ubicación y cobertura no guarda" bug). `saveRef.current` is reassigned every
    // render, so by the time the timer fires it points at a handleSave that sees [A].
    autoTimer.current = setTimeout(() => { void saveRef.current?.(true); }, 1000);
  }

  // Persist pending edits immediately (cancel the debounce). Bound to input blur
  // and used by the unsaved-changes guard. No-op when nothing is pending.
  function flush() {
    if (autoTimer.current) { clearTimeout(autoTimer.current); autoTimer.current = null; }
    if (dirtyRef.current) void handleSave(true);
  }

  function showSavedConfirmation() {
    const flash = ++savedFlashSeq.current;
    if (savedTimer.current) clearTimeout(savedTimer.current);
    setDirty(false);
    dirtyRef.current = false;
    setSaved(true);
    savedTimer.current = setTimeout(() => {
      if (flash === savedFlashSeq.current) setSaved(false);
    }, 3000);
  }

  useEffect(() => () => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    if (dirtyRef.current) void saveRef.current?.(true);
  }, []);

  function openCertForm(profession?: string) {
    setCertError(null);
    setCertDraft({ profession, name: "", institution: "", year: "" });
  }
  // Save the cert being typed — all three fields are REQUIRED, so an incomplete
  // certification can never be added (the button explicitly SAVES this one).
  function saveCert() {
    if (!certDraft) return;
    const name = limitText(certDraft.name.trim(), SHORT_TEXT_MAX_LENGTH);
    const institution = limitText(certDraft.institution.trim(), SHORT_TEXT_MAX_LENGTH);
    const year = certDraft.year.trim();
    if (!name || !institution || year.length !== 4) {
      setCertError(t("certAllRequired"));
      return;
    }
    setCertifications((prev) => [...prev, { id: `ct_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name, institution, year, profession: certDraft.profession }]);
    setCertDraft(null);
    setCertError(null);
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
      const preparedFile = await prepareImageForUpload(file, { maxDimension: 1200 });
      const fd = new FormData();
      fd.append("file", preparedFile);
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
      showSavedConfirmation();
      onSaved?.();
    } catch (e) {
      // Revert the optimistic preview and show the specific reason (size/format).
      setAvatarPreview(initialAvatarUrl);
      const code = getImageUploadPreparationErrorCode(e);
      setError(code === "too_large" ? t("photoTooLarge") : code === "unsupported" ? t("photoUnsupported") : e instanceof Error && e.message ? e.message : t("photoError"));
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handlePhotoRemove() {
    setAutoSaving(true);
    setError(null);
    setAvatarPreview(null);
    try {
      const supabase = createClient();
      const { error: removeError } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", profileId);
      if (removeError) throw new Error(t("photoError"));
      await supabase.auth.updateUser({ data: { avatar_url: null } });
      showSavedConfirmation();
      onSaved?.();
    } catch (e) {
      setAvatarPreview(initialAvatarUrl);
      setError(e instanceof Error && e.message ? e.message : t("photoError"));
    } finally {
      setAutoSaving(false);
    }
  }

  async function saveBusinessNameVisibility(nextOnly: boolean) {
    const cleanBusinessName = limitText(businessName.trim(), NAME_MAX_LENGTH);
    if (!cleanBusinessName) return;
    setAutoSaving(true);
    setError(null);
    const supabase = createClient();
    try {
      const { error: businessError } = await supabase
        .from("professionals")
        .update({
          business_name: cleanBusinessName,
          public_business_name_only: nextOnly,
        })
        .eq("id", professionalId);
      if (businessError) throw businessError;
      showSavedConfirmation();
      onSaved?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setAutoSaving(false);
    }
  }

  async function handleSave(auto = false): Promise<boolean> {
    const seq = ++saveSeq.current;
    if (auto) setAutoSaving(true); else setSaving(true);
    setError(null);
    const supabase = createClient();

    try {
      // Price is set per-service in the Servicios tab now (single source of truth).
      // Mi perfil no longer writes `pricing`/`hourly_rate` — existing DB values are
      // left untouched as a display fallback for pros who haven't moved over yet.

      // Location = the work zones (provincia/canton) the pro listed. Exact map pins
      // mean fixed workplaces; zones without a pin mean client-location coverage.
      // provincia_id/canton_id keep the PRIMARY area for back-compat display;
      // search_* arrays drive location-aware /buscar.
      const effectiveWorkplaces = workplaces.map((wp, index) => normalizeWorkplaceId(wp, index));
      const effectiveVideoConsult = canOfferVideoConsult && videoConsult;
      const onlineCoverage = effectiveVideoConsult && videoCoverageCountry ? [{ level: "country" as const }] : [];
      const hasExactWorkplace = effectiveWorkplaces.some((w) => w.lat != null && w.lng != null);
      const hasCoverageZone = effectiveWorkplaces.some((w) => w.lat == null || w.lng == null);
      const serviceType = [hasExactWorkplace ? "fixed" : null, hasCoverageZone ? "mobile" : null].filter(Boolean).join(",") || "mobile";
      const { provincias, cantones, coverageProvincias, coverageCountry } = computeSearchAreas(effectiveWorkplaces, onlineCoverage);
      const primary = primaryArea(effectiveWorkplaces, onlineCoverage);

      const baseUpdate: Record<string, unknown> = {
        bio: limitText(bio, PROFILE_BIO_MAX_LENGTH),
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
      // The OTHER optional identity columns. These may not all be migrated on every
      // environment, so they're saved best-effort (a missing column is ignored) — and,
      // crucially, SEPARATELY from `workplaces` (below) so a missing column here can
      // NEVER drop the saved locations.
      const cleanBusinessName = limitText(businessName.trim(), NAME_MAX_LENGTH);
      const businessIdentityFields = {
        business_name: cleanBusinessName || null,
        public_business_name_only: !!cleanBusinessName && publicBusinessNameOnlyRef.current,
      };
      const identityFields = {
        coverage_areas: onlineCoverage,
        coverage_provincias: coverageProvincias,
        coverage_country: coverageCountry,
        insurance_networks: insurers,
        call_phone: allowPhoneCall ? callPhone.trim() || whatsapp.trim() || null : null,
        allow_phone_call: allowPhoneCall,
        contact_email: showContactEmail ? contactEmail.trim() || null : null,
      };

      // 1) Core fields — guaranteed columns; a failure here is a real error.
      const { error: baseError } = await supabase
        .from("professionals")
        .update(baseUpdate)
        .eq("id", professionalId);
      if (baseError) throw baseError;

      const cleanWhatsapp = whatsapp.trim();
      if (cleanWhatsapp) {
        const { error: accountPhoneError } = await supabase
          .from("profiles")
          .update({ phone: cleanWhatsapp })
          .eq("id", profileId);
        if (accountPhoneError) throw accountPhoneError;
      }

      // 2) LOCATIONS — saved in their OWN update so an unrelated, possibly-unmigrated
      // optional column (contact_email, coverage_*, …) can NEVER drop them. This was
      // the persistence bug: `workplaces` was bundled with those columns and the
      // all-or-nothing fallback silently re-saved WITHOUT it (and showed "Guardado").
      // `search_*` are the denormalized arrays that power location search; if they
      // aren't migrated we retry with just `workplaces` — the essential bit — so the
      // locations always persist. A genuine failure (e.g. RLS) is surfaced, never
      // swallowed into a false confirmation.
      let { error: locError } = await supabase
        .from("professionals")
        .update({ workplaces: effectiveWorkplaces, search_provincias: provincias, search_cantones: cantones })
        .eq("id", professionalId);
      if (locError && /search_provincias|search_cantones|could not find|PGRST204|schema cache/i.test(locError.message)) {
        ({ error: locError } = await supabase.from("professionals").update({ workplaces: effectiveWorkplaces }).eq("id", professionalId));
      }
      if (locError) throw locError;

      const { error: businessError } = await supabase
        .from("professionals")
        .update(businessIdentityFields)
        .eq("id", professionalId);
      if (businessError) throw businessError;

      // 3) Other optional identity columns — best-effort, NEVER fatal. A not-yet-migrated
      // column (or any error here) must not abort the save: the core + locations already
      // persisted, and throwing would leave the whole form `dirty` (which kept firing the
      // "unsaved changes" beforeunload warning even though the zones saved). Log only.
      const { error: idError } = await supabase
        .from("professionals")
        .update(identityFields)
        .eq("id", professionalId);
      if (idError) console.warn("[profile-editor] optional identity columns not saved:", idError.message);

      // Videoconsulta is a visible client-facing capability, so save it independently
      // from the best-effort optional identity bundle above.
      const { error: videoError } = await supabase
        .from("professionals")
        .update({ videoconsulta: effectiveVideoConsult })
        .eq("id", professionalId);
      if (videoError) throw videoError;

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

      // Social links — store ONLY clean usernames, valid + non-empty. The write
      // result is CHECKED so "Guardado" is never shown on a silent failure: if the
      // pro is actually saving usernames and the write fails (e.g. the social_links
      // column isn't migrated → PGRST204, or RLS), we surface a real error instead
      // of a false confirmation. (When there's nothing to save we ignore a missing
      // column so non-social pros aren't blocked.)
      const social_links: Record<string, string> = Object.fromEntries(
        SOCIAL_NETWORKS
          .map(({ key }) => [key, cleanUsername(social[key])] as const)
          .filter(([, u]) => u && isValidUsername(u))
      );
      const websiteValue = website.trim();
      const previousWebsite = cleanWebsiteUrl(initial.social_links?.website);
      if (websiteValue && isValidWebsiteUrl(websiteValue)) {
        social_links.website = cleanWebsiteUrl(websiteValue);
      } else if (websiteValue && previousWebsite) {
        // Keep the last saved website while the user is typing an incomplete URL.
        social_links.website = previousWebsite;
      }
      // NON-FATAL: a social_links failure must never abort the save (the core + locations
      // already persisted). If the column simply isn't migrated yet (056 pending), swallow
      // it silently. For a real failure with usernames present, surface a soft warning AFTER
      // clearing `dirty` — so the user is informed but the beforeunload warning never sticks.
      let socialWarning: string | null = null;
      const socialChanged = stableJson(social_links) !== stableJson(savedSocialLinksRef.current);
      if (socialChanged) {
        const { error: socialError } = await supabase
          .from("professionals")
          .update({ social_links })
          .eq("id", professionalId);
        if (socialError) {
          console.error("[profile-editor] social_links save failed:", socialError.message);
          if (!/social_links|could not find|PGRST204|schema cache/i.test(socialError.message)) {
            socialWarning = t("socialSaveError");
          }
        } else {
          savedSocialLinksRef.current = social_links;
        }
      }

      // Persist the personal/display name — but NEVER overwrite a verified
      // official name (it's locked; corrections go through admin review).
      const cleanFullName = limitText(fullName.trim(), NAME_MAX_LENGTH);
      if (cleanFullName && !nameLocked) {
        await supabase.from("profiles").update({ full_name: cleanFullName }).eq("id", profileId);
        // Mirror into auth metadata so the header/menu (which read
        // user_metadata.full_name) update IMMEDIATELY — updateUser fires
        // onAuthStateChange (USER_UPDATED), which useAuth subscribes to. No reload.
        await supabase.auth.updateUser({ data: { full_name: cleanFullName } });
      }

      // Core + locations succeeded → the profile is saved. ALWAYS clear `dirty` here so the
      // "unsaved changes" beforeunload warning can never get stuck (only a core/location
      // failure throws and keeps it dirty). A best-effort social failure shows a soft notice
      // but does NOT keep the form dirty.
      if (seq === saveSeq.current) {
        setDirty(false);
        dirtyRef.current = false;
        if (socialWarning) {
          setError(socialWarning);
        } else {
          showSavedConfirmation();
        }
      }
      if (seq === saveSeq.current) onSaved?.();
      return true;
    } catch (err: unknown) {
      if (seq === saveSeq.current) {
        setError(err instanceof Error ? err.message : t("saveError"));
      }
      return false;
    } finally {
      if (seq === saveSeq.current) {
        setSaving(false);
        setAutoSaving(false);
      }
    }
  }


  // App-wide autosave: report status to the section title row (inline, no layout shift).
  useReportSaveStatus(saving || autoSaving || photoUploading, saved, dirty);

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ONE cohesive settings card (instead of 6 separate boxes) — the sections are
          divider-separated rows; each expands inline into a soft inset field panel. */}
      <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm divide-y divide-[#eef0f2]">
      {/* ── Datos básicos ─────────────────────────────────────────────── */}
      <Section id="basic" title={t("secBasic")} desc={t("secBasicDesc")} open={openSections.has("basic")} onToggle={toggleSection}>
        {/* Photo — explicit buttons, no hover-to-change */}
        <div data-field="photo" className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0 rounded-full">
            <ImagePreviewDialog
              src={avatarPreview}
              alt={t("photoAlt")}
              openLabel={locale === "en" ? "View profile photo" : "Ver foto de perfil"}
              closeLabel={locale === "en" ? "Close" : "Cerrar"}
            >
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarPreview}
                  alt={t("photoAlt")}
                  className="h-20 w-20 rounded-full border-2 border-[#e5e7eb] object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-[#bfdbfe] bg-[#EBF5FB]">
                  <Camera className="h-7 w-7 text-[#009FD9]" />
                </div>
              )}
            </ImagePreviewDialog>
            {photoUploading && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                <span className="h-5 w-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 flex flex-col gap-2">
            <p className="text-sm font-medium text-[#374151]">{t("profilePhoto")}</p>
            {avatarPreview ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()} className="shrink-0 px-3">
                  <Camera className="h-4 w-4" /> {t("changePhoto")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={handlePhotoRemove} className="shrink-0 px-2.5 text-red-500 hover:text-red-600">
                  <X className="h-4 w-4" /> {t("removePhoto")}
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()} className="self-start">
                <Camera className="h-4 w-4" /> {t("addPhoto")}
              </Button>
            )}
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePhotoSelect(f); e.target.value = ""; }}
          />
        </div>

        {/* Official name — locked when verified / national cédula. The "Verificado" badge
            lives ONCE in the panel HEADER (next to the name+avatar); here the Lock icon +
            the help text below already convey the field is official + read-only, so we do
            NOT repeat "Verificado" in this label (sprint 323 dedup). */}
        {nameLocked ? (
          <div>
            <Input
              label={<>{t("fullName")} <span className="text-red-500">*</span></>}
              value={resolvedFullName}
              disabled
              rightIcon={<Lock className="h-4 w-4" />}
            />
            <p className="text-xs text-[#6b7280] mt-1.5">
              {t.rich("nameLockedHelp", { ...rich, link: (c) => <Link href="/dashboard/profesional?tab=soporte" className="text-[#009FD9] font-medium hover:underline">{c}</Link> })}
            </p>
          </div>
        ) : (
          <Input
            label={<>{t("fullName")} <span className="text-red-500">*</span></>}
            value={fullName}
            maxLength={NAME_MAX_LENGTH}
            onChange={(e) => { setFullName(limitText(e.target.value, NAME_MAX_LENGTH)); touch(); }}
            onBlur={flush}
            placeholder={t("fullNamePlaceholder")}
          />
        )}

        {/* Brand / business name — optional */}
        <Input
          label={<>{t("businessName")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span></>}
          value={businessName}
          maxLength={NAME_MAX_LENGTH}
          onChange={(e) => {
            const next = limitText(e.target.value, NAME_MAX_LENGTH);
            setBusinessName(next);
            if (!next.trim()) setPublicBusinessNameOnly(false);
            touch();
          }}
          onBlur={flush}
          placeholder={t("businessPlaceholder")}
        />
        {hasBusinessName && (
          <div className="flex items-center justify-between gap-4 rounded-xl bg-[#f9fafb] p-3.5">
            <p className="text-sm font-medium text-[#111827]">{t("businessNameOnly")}</p>
            <button
              type="button"
              onClick={() => {
                const next = !publicBusinessNameOnly;
                publicBusinessNameOnlyRef.current = next;
                setPublicBusinessNameOnly(next);
                void saveBusinessNameVisibility(next);
              }}
              className={cn("relative h-6 w-11 rounded-full transition-all shrink-0", publicBusinessNameOnly ? "bg-[#009FD9]" : "bg-[#d1d5db]")}
              aria-label={t("businessNameOnly")}
            >
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", publicBusinessNameOnly ? "left-5" : "left-0.5")} />
            </button>
          </div>
        )}

        {/* Description */}
        <div data-field="bio">
          <label className="text-sm font-medium text-[#374151] block mb-1.5">{t("description")} <span className="text-red-500">*</span></label>
          <textarea
            className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[110px] resize-none focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
            placeholder={t("descPlaceholder")}
            value={bio}
            maxLength={PROFILE_BIO_MAX_LENGTH}
            onChange={(e) => { setBio(limitText(e.target.value, PROFILE_BIO_MAX_LENGTH)); touch(); }}
            onBlur={flush}
          />
        </div>
      </Section>

      {/* Profesiones + servicios are managed in the "Profesiones" tab (consolidated
          there so they're not edited in two places). */}

      {/* ── Certificaciones — POR PROFESIÓN. Saved certs are read-only rows; a
             cert is ADDED via an explicit form whose "Guardar certificación"
             button requires all three fields. ─────── */}
      <Section id="certs" title={t("secCerts")} desc={t("secCertsDesc")} open={openSections.has("certs")} onToggle={toggleSection}>
        {(professions.length > 0 ? professions : [""]).map((prof) => {
          const certsForProf = certifications.filter((c) => (c.profession || professions[0] || "") === prof);
          const draftHere = !!certDraft && (certDraft.profession ?? "") === (prof || "");
          const inputCls = "h-10 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";
          return (
            <div key={prof || "general"} className="flex flex-col gap-2.5 border-t border-[#f3f4f6] pt-3 first:border-t-0 first:pt-0">
              {professions.length > 1 && prof && (
                <p className="text-xs font-bold uppercase tracking-wide text-[#0089bb]">{getCategoryLabel(prof, locale)}</p>
              )}
              {/* Saved certs — read-only */}
              {certsForProf.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-xl bg-[#f9fafb] px-3 py-2">
                  <Award className="h-4 w-4 text-[#009FD9] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#111827] truncate">{c.name}</p>
                    <p className="text-xs text-[#6b7280] truncate">{[c.institution, c.year].filter(Boolean).join(" · ")}</p>
                  </div>
                  <button type="button" onClick={() => removeCertification(c.id!)} className="h-8 w-8 rounded-lg flex items-center justify-center text-[#9ca3af] hover:text-red-500 hover:bg-red-50 transition-colors shrink-0" aria-label={t("certRemove")}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {/* Add form (all fields required) OR the add-another action */}
              {draftHere ? (
                <div className="rounded-xl bg-[#f9fafb] p-3 flex flex-col gap-2">
                  <input type="text" value={certDraft!.name} maxLength={SHORT_TEXT_MAX_LENGTH} onChange={(e) => setCertDraft((d) => d && { ...d, name: limitText(e.target.value, SHORT_TEXT_MAX_LENGTH) })} placeholder={t("certNamePlaceholder")} className={inputCls} autoFocus />
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr,7rem] gap-2">
                    <input type="text" value={certDraft!.institution} maxLength={SHORT_TEXT_MAX_LENGTH} onChange={(e) => setCertDraft((d) => d && { ...d, institution: limitText(e.target.value, SHORT_TEXT_MAX_LENGTH) })} placeholder={t("certInstitution")} className={inputCls} />
                    <input type="text" inputMode="numeric" maxLength={4} value={certDraft!.year} onChange={(e) => setCertDraft((d) => d && { ...d, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder={t("certYear")} className={inputCls} />
                  </div>
                  {certError && <p className="text-xs text-red-600">{certError}</p>}
                  <div className="flex gap-2 pt-0.5">
                    <Button type="button" size="sm" onClick={saveCert}>{t("certSave")}</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setCertDraft(null); setCertError(null); }}>{t("cancel")}</Button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => openCertForm(prof || undefined)} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#009FD9] hover:underline self-start">
                  <Plus className="h-4 w-4" /> {professions.length > 1 && prof ? t("addCertTo", { profession: getCategoryLabel(prof, locale) }) : t("addCert")}
                </button>
              )}
            </div>
          );
        })}
      </Section>

      {/* ── Ubicación y cobertura ─────────────────────────────────────── */}
      <Section id="location" title={t("secLocation")} desc={t("secLocationDesc")} open={openSections.has("location")} onToggle={toggleSection}>
        {/* Work zones — provincia/cantón first (drives /buscar), optional exact pin. */}
        <div data-field="location">
          <label className="text-sm font-medium text-[#374151] block mb-2">
            {t("workplaces")} <span className="text-red-500">*</span>
          </label>
          <WorkplacesPicker
            value={workplaces}
            onChange={(next) => { setWorkplaces(next); touch(); }}
            mapHeight={168}
            extraActions={canOfferVideoConsult ? (
              <div className="flex w-full items-center justify-between gap-3 rounded-xl bg-[#f9fafb] p-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]">
                    <Video className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#111827]">{t("videoConsultOption")}</p>
                    <p className="mt-0.5 text-xs text-[#6b7280]">{t("videoCountryHelp")}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !(videoConsult && videoCoverageCountry);
                    setVideoConsult(next);
                    setVideoCoverageCountry(next);
                    touch();
                  }}
                  className={cn(
                    "relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-all duration-200",
                    videoConsult && videoCoverageCountry ? "bg-[#009FD9]" : "bg-[#d1d5db]"
                  )}
                  aria-label={t("videoConsultOption")}
                >
                  <span className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200",
                    videoConsult && videoCoverageCountry ? "left-5" : "left-0.5"
                  )} />
                </button>
              </div>
            ) : null}
          />
        </div>
      </Section>

      {/* ── Contacto ──────────────────────────────────────────────────── */}
      <Section id="contact" title={t("secContact")} desc={t("secContactDesc")} open={openSections.has("contact")} onToggle={toggleSection}>
        {/* WhatsApp — required contact channel. */}
        <div data-field="whatsapp">
          <PhoneInput
            label={t("whatsapp")}
            required
            value={whatsapp}
            onChange={(digits) => { setWhatsapp(digits); touch(); }}
          />
          <p className="mt-1.5 text-xs text-[#6b7280]">{t("whatsappHelp")}</p>
        </div>

        {/* Progressive disclosure: turning on "Permitir contacto por llamada"
            reveals the optional separate call line. Empty → the WhatsApp number
            is used for calls too (so the toggle alone is self-explanatory). */}
        <div className="flex items-center justify-between gap-4 rounded-xl bg-[#f9fafb] p-3.5">
          <p className="text-sm font-medium text-[#111827]">{t("allowCallLabel")}</p>
          <button
            type="button"
            onClick={() => {
              setAllowPhoneCall((v) => {
                const nv = !v;
                if (nv && !callPhone.trim() && whatsapp.trim()) setCallPhone(whatsapp);
                return nv;
              });
              touch();
            }}
            className={cn("relative h-6 w-11 rounded-full transition-all shrink-0", allowPhoneCall ? "bg-[#009FD9]" : "bg-[#d1d5db]")}
            aria-label={t("allowCallLabel")}
          >
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", allowPhoneCall ? "left-5" : "left-0.5")} />
          </button>
        </div>

        {allowPhoneCall && (
          <div>
            <PhoneInput
              label={<>{t("callNumber")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span></>}
              value={callPhone}
              onChange={(digits) => { setCallPhone(digits); touch(); }}
            />
            <p className="mt-1.5 text-xs text-[#6b7280]">{t("callNumberHelp")}</p>
          </div>
        )}

        {/* Optional public contact email — opt-in via a toggle (consistent with the
            call-number pattern). Off → no email is shown; turning it off clears it. */}
        <div className="flex items-center justify-between gap-4 rounded-xl bg-[#f9fafb] p-3.5">
          <p className="text-sm font-medium text-[#111827]">{t("contactEmail")}</p>
          <button
            type="button"
            onClick={() => {
              setShowContactEmail((v) => {
                const nv = !v;
                if (nv && !contactEmail.trim() && accountEmail) setContactEmail(accountEmail);
                return nv;
              });
              touch();
            }}
            className={cn("relative h-6 w-11 rounded-full transition-all shrink-0", showContactEmail ? "bg-[#009FD9]" : "bg-[#d1d5db]")}
            aria-label={t("contactEmail")}
          >
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", showContactEmail ? "left-5" : "left-0.5")} />
          </button>
        </div>

        {showContactEmail && (
          <div>
            <input
              type="email"
              inputMode="email"
              placeholder={t("emailPlaceholder")}
              value={contactEmail}
              onChange={(e) => { setContactEmail(e.target.value); touch(); }}
              onBlur={flush}
              className="w-full h-11 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
            />
            {contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim()) && (
              <p className="text-xs text-red-500 mt-1">{t("emailInvalid")}</p>
            )}
          </div>
        )}
      </Section>

      {/* ── Redes sociales — USERNAME only; we build the link (additive to casos). ── */}
      <Section id="social" title={t("secSocial")} desc={t("secSocialDesc")} open={openSections.has("social")} onToggle={toggleSection}>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-sm font-medium text-[#374151] mb-1.5 flex items-center gap-1.5">
              <Globe className="h-4 w-4 text-[#6b7280]" strokeWidth={2.5} /> {t("website")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
            </label>
            <input
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t("websitePlaceholder")}
              value={website}
              maxLength={120}
              onChange={(e) => { setWebsite(e.target.value.slice(0, 120)); touch(); }}
              onBlur={flush}
              className={`h-11 w-full rounded-xl border bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[#009FD9] ${website.trim() && !isValidWebsiteUrl(website) ? "border-red-300" : "border-[#e5e7eb]"}`}
            />
            {website.trim() && !isValidWebsiteUrl(website) && <p className="text-xs text-red-500 mt-1">{t("websiteInvalid")}</p>}
          </div>
          {SOCIAL_NETWORKS.map(({ key, label, prefix }) => {
            const Icon = { instagram: InstagramIcon, facebook: FacebookIcon, tiktok: TikTokIcon, linkedin: LinkedInIcon }[key];
            const cleaned = cleanUsername(social[key]);
            const invalid = cleaned.length > 0 && !isValidUsername(cleaned);
            return (
              <div key={key}>
                <label className="text-sm font-medium text-[#374151] mb-1.5 flex items-center gap-1.5">
                  <Icon className="h-4 w-4 text-[#6b7280]" /> {label} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
                </label>
                {/* Prefix shows the network so the pro types ONLY their username. */}
                <div className={`flex h-11 rounded-xl border bg-white overflow-hidden transition-all focus-within:ring-2 focus-within:ring-[#009FD9] ${invalid ? "border-red-300" : "border-[#e5e7eb]"}`}>
                  <span className="flex items-center px-3 bg-[#f9fafb] text-xs text-[#6b7280] border-r border-[#e5e7eb] whitespace-nowrap">{prefix}</span>
                  <input
                    type="text"
                    inputMode="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder={t("socialUserPlaceholder")}
                    value={social[key]}
                    maxLength={50}
                    onChange={(e) => { setSocial((s) => ({ ...s, [key]: e.target.value.slice(0, 50) })); touch(); }}
                    onBlur={flush}
                    className="flex-1 min-w-0 px-3 text-sm text-[#111827] placeholder:text-[#9ca3af] outline-none bg-transparent"
                  />
                </div>
                {invalid && <p className="text-xs text-red-500 mt-1">{t("socialInvalid")}</p>}
              </div>
            );
          })}
          {t("socialHelp") ? <p className="text-xs text-[#9ca3af]">{t("socialHelp")}</p> : null}
        </div>
      </Section>

      {/* ── Idiomas (+ aseguradoras only for health pros) ─────────────────
          Aseguradoras only apply to HEALTH categories (es_salud) — a plumber
          has nothing to do with insurance, so we hide the field entirely for
          non-health pros (it isn't part of their profile at all). */}
      <Section id="lang" title={isHealthPro ? t("secLangInsurers") : t("secLang")} desc={t("secLangDesc")} open={openSections.has("lang")} onToggle={toggleSection}>
        {/* Languages — defaults to Español; extra languages are an optional bonus */}
        <div>
          <label className="text-sm font-medium text-[#374151] block mb-1.5">
            {t("languagesSpoken")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
          </label>
          <LanguagesInput value={languages} onChange={(next) => { setLanguages(next); touch(); }} />
        </div>

        {/* Aseguradoras — ONLY for health (es_salud) professionals */}
        {isHealthPro && (
          <div data-field="insurers">
            <label className="text-sm font-medium text-[#374151] block mb-1.5">
              {t("insurers")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
            </label>
            <p className="text-xs text-[#9ca3af] mb-2">{t("insurersHelp")}</p>
            <AseguradorasInput value={insurers} onChange={(next) => { setInsurers(next); touch(); }} />
          </div>
        )}
      </Section>

      {extraSections.map((section) => (
        <Section
          key={section.id}
          id={section.id}
          title={section.title}
          desc={section.desc}
          open={openSections.has(section.id)}
          onToggle={toggleSection}
        >
          {section.children}
        </Section>
      ))}
      </div>

      {/* Contact preference lives in the Disponibilidad tab now. */}

      {/* No save button — changes autosave (debounced) and the SaveStatus at the
          top reflects the state. The guard still flushes pending edits on nav. */}

      {/* Designed unsaved-changes dialog (replaces the browser default) */}
      <UnsavedChangesGuard dirty={dirty} onSave={() => handleSave(false)} />
    </div>
  );
}
