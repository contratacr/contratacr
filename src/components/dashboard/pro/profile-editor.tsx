"use client";

import { useState, useRef, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { UnsavedChangesGuard } from "@/components/dashboard/unsaved-changes-guard";
import { useReportSaveStatus } from "@/components/dashboard/save-status-context";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Input } from "@/components/ui/input";
import { ImagePreviewDialog } from "@/components/ui/image-preview-dialog";
import { PhoneInput, isPhoneComplete } from "@/components/ui/phone-input";
import { LanguagesInput } from "@/components/ui/languages-input";
import { WorkplacesPicker, type Workplace } from "@/components/maps/workplaces-picker";
import { IMAGE_ACCEPT } from "@/lib/upload-validation";
import { getImageUploadPreparationErrorCode, prepareImageForUpload, uploadPhotoFormDataWithRetry } from "@/lib/client-image-upload";
import { createClient } from "@/lib/supabase/client";
import { detectIdType } from "@/lib/cedula";
import { Camera, X, Plus, ChevronDown, ChevronLeft, Lock, Award, Globe, Pencil, Eye, Trash2 } from "lucide-react";
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
  collapseOnSave?: boolean;
  /** A "Completa tu perfil" item the user clicked — opens the matching section
   *  and scrolls to the field. `focusKey` changes on every click so repeats fire. */
  focusField?: string | null;
  focusKey?: number;
  resetKey?: number;
  extraSections?: Array<{ id: string; title: string; desc?: string; children: React.ReactNode; footer?: React.ReactNode | null }>;
}

// "Completa tu perfil" field → which collapsible section holds it.
const FIELD_SECTION: Record<string, string> = {
  photo: "basic",
  bio: "basic",
  location: "location",
  whatsapp: "contact",
  publicLinks: "social",
  languages: "lang",
  education: "certs",
  insurers: "lang",
  verification: "verificacion",
};

// These completion steps represent the whole section. Opening the section at
// the top feels better than jumping to the first input.
const SECTION_TOP_COMPLETION_FIELDS = new Set(["publicLinks", "education"]);

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

function Section({ id, title, desc, open, mobileFocused, onToggle, onActivate, children, footer }: { id: string; title: string; desc?: string; open: boolean; mobileFocused?: boolean; onToggle: (id: string) => void; onActivate?: (id: string) => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    // A borderless ROW inside the shared settings card (the card + divide-y dividers live in
    // the editor's wrapper). Tappable header (white, hover tint) + an inline field area set
    // off by a hairline; the open header gets a faint tint so the active row is obvious.
    <div id={`sec-${id}`} className={cn("scroll-mt-24", mobileFocused && !open && "max-sm:hidden", open && "max-sm:bg-white")}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        className={cn("w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors sm:flex sm:px-5", open ? "hidden bg-[#fafafa] sm:flex" : "flex hover:bg-[#fafafa]")}
        aria-expanded={open}
      >
        {open && (
          <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#162543] max-sm:flex" aria-hidden="true">
            <ChevronLeft className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          <p className={cn("text-[15px] font-semibold text-[#111827] leading-tight", open && "max-sm:text-base")}>{title}</p>
          {desc && <p className={cn("text-xs text-[#6b7280] mt-1", open && "max-sm:hidden")}>{desc}</p>}
        </div>
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#162543] transition-colors hover:bg-[#EBF5FB] hover:text-[#009FD9]", open && "max-sm:hidden")} aria-hidden="true">
          {open ? <ChevronDown className="h-[18px] w-[18px] rotate-180" /> : <Pencil className="h-[18px] w-[18px]" />}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-6 pt-5 sm:px-5 sm:pt-6" onFocusCapture={() => onActivate?.(id)} onPointerDownCapture={() => onActivate?.(id)}>
          <div className="flex flex-col gap-5">
            {children}
          </div>
          {footer}
        </div>
      )}
    </div>
  );
}

function ProfileCheckRow({
  title,
  description,
  checked,
  onToggle,
  ariaLabel,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-4 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/35"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[#111827]">{title}</span>
        {description ? <span className="mt-0.5 block text-xs leading-5 text-[#64748b]">{description}</span> : null}
      </span>
      <ToggleSwitch checked={checked} />
    </button>
  );
}

// Back-compat: an existing pro's location may live in `workplaces` (current) or in
// legacy `coverage_areas` / primary `provincia_id`/`canton_id`. Seed the zone list
// from whatever exists so re-saving under the simplified model never drops their
// search presence. (Whole-province / whole-country legacy coverage isn't a zone, so
// it isn't seeded — the pro re-picks their cantón.)
function seedZones(init: ProData): Workplace[] {
  const seededCountry =
    init.coverage_country && !init.videoconsulta
      ? [{ id: "wp_todo_costa_rica", name: "Todo Costa Rica", address: "", level: "country" as const }]
      : [];
  if (Array.isArray(init.workplaces) && init.workplaces.length > 0) {
    return [...seededCountry, ...init.workplaces.map((wp, index) => normalizeWorkplaceId(wp, index))];
  }
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
  return [...seededCountry, ...out];
}

export function ProfileEditor({ professionalId, profileId, initial, onSaved, collapseOnSave = true, focusField, focusKey, resetKey, extraSections = [] }: ProfileEditorProps) {
  const locale = useLocale();
  const t = useTranslations("profileEditor");
  const initialProfile = Array.isArray(initial.profiles) ? initial.profiles[0] : initial.profiles;
  const initialFullName = typeof initialProfile?.full_name === "string" ? initialProfile.full_name.trim() : "";
  const initialEmail = typeof initialProfile?.email === "string" ? initialProfile.email : "";
  const initialAvatarUrl = typeof initialProfile?.avatar_url === "string" ? initialProfile.avatar_url : null;
  // Which collapsible sections are open. Empty = all collapsed (default), so a
  // pro lands on a tidy, scannable list and opens what they want.
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const didMountResetEffect = useRef(false);
  const isMobileProfileLayout = () =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
  const applySectionToggle = (id: string) =>
    setOpenSections((prev) => {
      if (isMobileProfileLayout()) {
        return prev.has(id) ? new Set() : new Set([id]);
      }
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const toggleSection = (id: string) => {
    const isClosingEmptyCertification =
      id === "certs" &&
      openSections.has(id) &&
      !!certDraft &&
      !certDraft.name.trim() &&
      !certDraft.institution.trim() &&
      !certDraft.year.trim();
    if (isClosingEmptyCertification) {
      cancelCertDraft();
      applySectionToggle(id);
      return;
    }
    const isClosingDirtySection = openSections.has(id) && activeDirtySection === id;
    const isLeavingDirtySection = isMobileProfileLayout() && activeDirtySection && activeDirtySection !== id;
    if (dirty && (isClosingDirtySection || isLeavingDirtySection)) {
      const event = new CustomEvent("ccr:confirm-unsaved-action", {
        cancelable: true,
        detail: { proceed: () => applySectionToggle(id) },
      });
      if (window.dispatchEvent(event)) applySectionToggle(id);
      return;
    }
    applySectionToggle(id);
  };

  // A "Completa tu perfil" item was clicked -> open its section, then either
  // align the section top or scroll to the exact missing field.
  useEffect(() => {
    if (!focusField) return;
    const sec = FIELD_SECTION[focusField];
    const openTmr = sec ? setTimeout(() => setOpenSections((prev) => {
      if (isMobileProfileLayout()) return new Set([sec]);
      return new Set(prev).add(sec);
    }), 0) : null;
    const tmr = setTimeout(() => {
      const section = sec ? document.getElementById(`sec-${sec}`) : null;
      const shouldOpenAtSectionTop = SECTION_TOP_COMPLETION_FIELDS.has(focusField);
      const el = shouldOpenAtSectionTop ? null : document.querySelector(`[data-field="${focusField}"]`);
      const isMobile = isMobileProfileLayout();
      if (shouldOpenAtSectionTop && isMobile) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (el) {
        (isMobile ? section ?? el : el).scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("field-flash");
        setTimeout(() => el.classList.remove("field-flash"), 1600);
      } else {
        section?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 160);
    return () => {
      if (openTmr) clearTimeout(openTmr);
      clearTimeout(tmr);
    };
  }, [focusField, focusKey]);

  useEffect(() => {
    if (!didMountResetEffect.current) {
      didMountResetEffect.current = true;
      return;
    }
    if (resetKey == null) return;
    const tmr = window.setTimeout(() => setOpenSections(new Set()), 0);
    return () => window.clearTimeout(tmr);
  }, [resetKey]);
  const rich = { strong: (c: React.ReactNode) => <strong>{c}</strong> };
  const photoInputRef = useRef<HTMLInputElement>(null);
  const avatarObjectUrlRef = useRef<string | null>(null);

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
  useEffect(() => {
    function onIdentityUpdated(event: Event) {
      const detail = (event as CustomEvent<{ fullName?: string | null; cedula?: string | null; verified?: boolean }>).detail;
      const nextName = typeof detail?.fullName === "string" ? detail.fullName.trim() : "";
      const nextCedula = typeof detail?.cedula === "string" ? detail.cedula.trim() : "";
      if (nextName) setFullName(nextName);
      if (nextCedula) setHasNationalCedula(detectIdType(nextCedula) === "cedula");
      setDirty(false);
      setActiveDirtySection(null);
      dirtyRef.current = false;
    }
    window.addEventListener("ccr:identity-updated", onIdentityUpdated);
    return () => window.removeEventListener("ccr:identity-updated", onIdentityUpdated);
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
  const [workplaces, setWorkplaces] = useState<Workplace[]>(() => seedZones(initial));
  // Default to "Español" (most professionals) so a Spanish-only pro is never
  // treated as "missing" languages. Extra languages are an optional bonus.
  const [languages, setLanguages] = useState<string[]>(
    Array.isArray(initial.languages) && initial.languages.length > 0 ? initial.languages : ["es"]
  );
  const [insurers, setInsurers] = useState<string[]>(Array.isArray(initial.insurance_networks) ? initial.insurance_networks : []);
  // Certifications — text entries: nombre + institución + año (all required).
  const [certifications, setCertifications] = useState<Certification[]>(
    Array.isArray(initial.certifications) ? initial.certifications : []
  );
  // Draft being added (one at a time, per profession). null = no form open.
  const [certDraft, setCertDraft] = useState<{ profession?: string; name: string; institution: string; year: string } | null>(null);
  const certDraftOpenedWhileDirtyRef = useRef(false);
  const [certError, setCertError] = useState<string | null>(null);
  const [videoConsult, setVideoConsult] = useState(!!initial.videoconsulta && canOfferVideoConsult);
  const [videoCoverageCountry, setVideoCoverageCountry] = useState(!!initial.videoconsulta && !!initial.coverage_country && canOfferVideoConsult);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    initialAvatarUrl
  );
  const [photoUploading, setPhotoUploading] = useState(false);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeDirtySection, setActiveDirtySection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const emailIsValid = !showContactEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim());
  const callPhoneIsValid = !allowPhoneCall || !callPhone.trim() || isPhoneComplete(callPhone);
  const hasWorkplace = workplaces.length > 0 || (canOfferVideoConsult && videoConsult && videoCoverageCountry);
  const socialIsValid =
    (!website.trim() || isValidWebsiteUrl(website)) &&
    SOCIAL_NETWORKS.every(({ key }) => {
      const username = cleanUsername(social[key]);
      return !username || isValidUsername(username);
    });

  function sectionValidationError(sectionId: string | null): string | null {
    if (sectionId === "basic") {
      if (!resolvedFullName.trim()) return locale === "en" ? "Full name is required." : "El nombre completo es obligatorio.";
      if (!bio.trim()) return locale === "en" ? "Description is required." : "La descripción es obligatoria.";
    }
    if (sectionId === "certs" && certDraft) {
      return locale === "en"
        ? "Save or cancel the certification you are editing."
        : "Guarda o cancela la certificación que estás editando.";
    }
    if (sectionId === "location" && !hasWorkplace) {
      return locale === "en"
        ? "Add a workplace or enable video consultations."
        : "Agrega un lugar de trabajo o activa las videoconsultas.";
    }
    if (sectionId === "contact") {
      if (!isPhoneComplete(whatsapp)) {
        return locale === "en" ? "Enter a complete contact number." : "Ingresa un número de contacto completo.";
      }
      if (!callPhoneIsValid) {
        return locale === "en" ? "Enter a complete call number." : "Ingresa un número para llamadas completo.";
      }
      if (!emailIsValid) {
        return locale === "en" ? "Enter a valid contact email." : "Ingresa un correo de contacto válido.";
      }
    }
    if (sectionId === "social" && !socialIsValid) {
      return locale === "en" ? "Check the website and social links." : "Revisa el sitio web y los enlaces públicos.";
    }
    return null;
  }


  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashSeq = useRef(0);
  const dirtyRef = useRef(false);
  const saveSeq = useRef(0);

  useEffect(() => {
    if (!dirtyRef.current && initialFullName && !fullName.trim()) {
      const tmr = window.setTimeout(() => setFullName(initialFullName), 0);
      return () => window.clearTimeout(tmr);
    }
  }, [initialFullName, fullName]);

  function touch(sectionId?: string) {
    if (savedTimer.current) {
      clearTimeout(savedTimer.current);
      savedTimer.current = null;
    }
    setSaved(false);
    setError(null);
    setDirty(true);
    if (sectionId) setActiveDirtySection(sectionId);
    dirtyRef.current = true;
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
    if (savedTimer.current) clearTimeout(savedTimer.current);
    if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
  }, []);

  function openCertForm(profession?: string) {
    certDraftOpenedWhileDirtyRef.current = dirty;
    setCertError(null);
    setCertDraft({ profession, name: "", institution: "", year: "" });
  }
  function updateCertDraft(field: "name" | "institution" | "year", value: string) {
    setCertDraft((current) => current ? { ...current, [field]: value } : current);
    setCertError(null);
    touch("certs");
  }
  function cancelCertDraft() {
    setCertDraft(null);
    setCertError(null);
    if (!certDraftOpenedWhileDirtyRef.current) {
      setDirty(false);
      dirtyRef.current = false;
      setActiveDirtySection(null);
    }
    certDraftOpenedWhileDirtyRef.current = false;
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
    certDraftOpenedWhileDirtyRef.current = false;
    setCertError(null);
    touch("certs");
  }
  function removeCertification(id: string) {
    setCertifications((prev) => prev.filter((c) => c.id !== id));
    touch("certs");
  }

  function cancelChanges() {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
    avatarObjectUrlRef.current = null;
    setBio(initial.bio ?? "");
    setWhatsapp(initial.whatsapp ?? "");
    setCallPhone(initial.call_phone ?? "");
    setAllowPhoneCall(!!initial.allow_phone_call);
    setContactEmail(initial.contact_email ?? accountEmail);
    setShowContactEmail(!!initial.contact_email);
    setSocial({
      instagram: cleanUsername(initial.social_links?.instagram),
      facebook: cleanUsername(initial.social_links?.facebook),
      tiktok: cleanUsername(initial.social_links?.tiktok),
      linkedin: cleanUsername(initial.social_links?.linkedin),
    });
    setWebsite(cleanWebsiteUrl(initial.social_links?.website));
    setFullName(initialFullName);
    setBusinessName(initial.business_name ?? "");
    setWorkplaces(seedZones(initial));
    setLanguages(Array.isArray(initial.languages) && initial.languages.length > 0 ? initial.languages : ["es"]);
    setInsurers(Array.isArray(initial.insurance_networks) ? initial.insurance_networks : []);
    setCertifications(Array.isArray(initial.certifications) ? initial.certifications : []);
    setCertDraft(null);
    certDraftOpenedWhileDirtyRef.current = false;
    setCertError(null);
    setVideoConsult(!!initial.videoconsulta && canOfferVideoConsult);
    setVideoCoverageCountry(!!initial.videoconsulta && !!initial.coverage_country && canOfferVideoConsult);
    setAvatarPreview(initialAvatarUrl);
    setPendingAvatarFile(null);
    setError(null);
    setSaved(false);
    setDirty(false);
    setActiveDirtySection(null);
    dirtyRef.current = false;
  }

  async function savePendingPhoto() {
    if (pendingAvatarFile) {
      setPhotoUploading(true);
      try {
        const preparedFile = await prepareImageForUpload(pendingAvatarFile, { maxDimension: 1200 });
        const fd = new FormData();
        fd.append("file", preparedFile);
        fd.append("type", "avatar");
        const upload = await uploadPhotoFormDataWithRetry(fd);
        if (!upload.ok || !upload.data.url) {
          throw new Error(upload.data.error || t("photoError"));
        }
        const { url } = upload.data;
        const supabase = createClient();
        const { error: upErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", profileId);
        if (upErr) throw new Error(t("photoError"));
        const { error: authErr } = await supabase.auth.updateUser({ data: { avatar_url: url } });
        if (authErr) throw new Error(t("photoError"));
        if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = null;
        setAvatarPreview(url);
        setPendingAvatarFile(null);
      } finally {
        setPhotoUploading(false);
      }
      return;
    }
    if (avatarPreview === null && initialAvatarUrl) {
      setPhotoUploading(true);
      try {
        const supabase = createClient();
        const { error: removeError } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", profileId);
        if (removeError) throw new Error(t("photoError"));
        await supabase.auth.updateUser({ data: { avatar_url: null } });
      } finally {
        setPhotoUploading(false);
      }
    }
  }

  function handlePhotoSelect(file: File) {
    setError(null);
    if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
    const previewUrl = URL.createObjectURL(file);
    avatarObjectUrlRef.current = previewUrl;
    setAvatarPreview(previewUrl);
    setPendingAvatarFile(file);
    touch("basic");
  }

  function handlePhotoRemove() {
    setError(null);
    if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
    avatarObjectUrlRef.current = null;
    setAvatarPreview(null);
    setPendingAvatarFile(null);
    touch("basic");
  }

  async function handleSave(): Promise<boolean> {
    const validationError = sectionValidationError(activeDirtySection);
    if (validationError) {
      setError(validationError);
      return false;
    }
    const seq = ++saveSeq.current;
    setSaving(true);
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
      const normalizedWorkplaces = workplaces.map((wp, index) => normalizeWorkplaceId(wp, index));
      const hasCountryWorkplace = normalizedWorkplaces.some((wp) => wp.level === "country");
      const effectiveWorkplaces = normalizedWorkplaces.filter((wp) => wp.level !== "country");
      const effectiveVideoConsult = canOfferVideoConsult && videoConsult;
      const coverageAreas = hasCountryWorkplace || (effectiveVideoConsult && videoCoverageCountry) ? [{ level: "country" as const }] : [];
      const hasExactWorkplace = effectiveWorkplaces.some((w) => w.lat != null && w.lng != null);
      const hasCoverageZone = effectiveWorkplaces.some((w) => w.lat == null || w.lng == null);
      const serviceType = [hasExactWorkplace ? "fixed" : null, hasCoverageZone ? "mobile" : null].filter(Boolean).join(",") || "mobile";
      const { provincias, cantones, coverageProvincias, coverageCountry } = computeSearchAreas(effectiveWorkplaces, coverageAreas);
      const primary = primaryArea(effectiveWorkplaces, coverageAreas);

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
      };
      const identityFields = {
        coverage_areas: coverageAreas,
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

      await savePendingPhoto();

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
        const { error: nameError } = await supabase.from("profiles").update({ full_name: cleanFullName }).eq("id", profileId);
        if (nameError) throw nameError;
        // Mirror into auth metadata so the header/menu (which read
        // user_metadata.full_name) update IMMEDIATELY — updateUser fires
        // onAuthStateChange (USER_UPDATED), which useAuth subscribes to. No reload.
        const { error: authError } = await supabase.auth.updateUser({ data: { full_name: cleanFullName } });
        if (authError) console.warn("[profile-editor] auth metadata sync failed:", authError.message);
      }

      // Core + locations succeeded → the profile is saved. ALWAYS clear `dirty` here so the
      // "unsaved changes" beforeunload warning can never get stuck (only a core/location
      // failure throws and keeps it dirty). A best-effort social failure shows a soft notice
      // but does NOT keep the form dirty.
      if (seq === saveSeq.current) {
        setDirty(false);
        setActiveDirtySection(null);
        dirtyRef.current = false;
        if (socialWarning) {
          setError(socialWarning);
        } else {
          showSavedConfirmation();
        }
      }
      if (seq === saveSeq.current) {
        if (collapseOnSave) setOpenSections(new Set());
        onSaved?.();
      }
      return true;
    } catch (err: unknown) {
      if (seq === saveSeq.current) {
        setError(err instanceof Error ? err.message : t("saveError"));
      }
      return false;
    } finally {
      if (seq === saveSeq.current) {
        setSaving(false);
      }
    }
  }


  useReportSaveStatus(saving || photoUploading, saved, dirty);

  const makeSectionFooter = (sectionId: string) => {
    const sectionActive = dirty && activeDirtySection === sectionId;
    const sectionInvalid = sectionValidationError(sectionId) !== null;
    return (
      <div className="mt-5 flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={cancelChanges}
          disabled={!sectionActive || saving || photoUploading}
          className="hidden h-10 rounded-xl px-4 text-sm font-semibold text-[#374151] transition-colors hover:bg-[#f3f4f6] disabled:cursor-not-allowed disabled:opacity-45 sm:inline-flex sm:items-center sm:justify-center"
        >
          {locale === "en" ? "Cancel" : "Cancelar"}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!sectionActive || sectionInvalid || saving || photoUploading}
          className="h-10 w-full rounded-xl bg-[#009FD9] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0089bb] disabled:cursor-not-allowed disabled:bg-[#cbd5e1] disabled:text-white sm:w-auto"
        >
          {saving || photoUploading ? (locale === "en" ? "Saving..." : "Guardando...") : locale === "en" ? "Save changes" : "Guardar cambios"}
        </button>
      </div>
    );
  };
  const mobileSectionFocused = openSections.size > 0;
  const activeMobileSectionId = Array.from(openSections)[0] ?? null;
  const activeMobileSectionTitle =
    activeMobileSectionId === "basic" ? t("secBasic")
    : activeMobileSectionId === "certs" ? t("secCerts")
    : activeMobileSectionId === "location" ? t("secLocation")
    : activeMobileSectionId === "contact" ? t("secContact")
    : activeMobileSectionId === "social" ? t("secSocial")
    : activeMobileSectionId === "lang" ? (isHealthPro ? t("secLangInsurers") : t("secLang"))
    : extraSections.find((section) => section.id === activeMobileSectionId)?.title ?? null;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("ccr:profile-mobile-section-title", { detail: mobileSectionFocused ? activeMobileSectionTitle : null }));
  }, [activeMobileSectionTitle, mobileSectionFocused]);

  useEffect(() => {
    const close = () => {
      const sectionId = Array.from(openSections)[0];
      if (sectionId) toggleSection(sectionId);
    };
    window.addEventListener("ccr:profile-mobile-close-section", close);
    return () => window.removeEventListener("ccr:profile-mobile-close-section", close);
  }, [openSections, dirty, activeDirtySection, certDraft]);

  return (
    <div className="mx-auto flex w-full max-w-none flex-col gap-4">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ONE cohesive settings card (instead of 6 separate boxes) — the sections are
          divider-separated rows; each expands inline into a soft inset field panel. */}
      <div className={cn(
        "bg-white sm:overflow-hidden sm:rounded-2xl sm:border sm:border-[#dfe8f0] sm:shadow-[0_10px_28px_-24px_rgba(15,23,42,0.65)]",
        mobileSectionFocused
          ? "rounded-none border-0 shadow-none"
          : "overflow-hidden rounded-2xl border border-[#dfe8f0] shadow-[0_10px_28px_-24px_rgba(15,23,42,0.65)]"
      )}>
      <div className={cn(!mobileSectionFocused && "divide-y divide-[#eef3f7]")}>
      <div className="hidden px-4 pb-4 pt-5 sm:block sm:px-5 sm:pt-6">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-[#111827]">{locale === "en" ? "Profile" : "Perfil"}</h2>
        </div>
      </div>
      {/* ── Datos básicos ─────────────────────────────────────────────── */}
      <Section footer={makeSectionFooter("basic")} id="basic" title={t("secBasic")} desc={t("secBasicDesc")} open={openSections.has("basic")} mobileFocused={mobileSectionFocused} onToggle={toggleSection} onActivate={setActiveDirtySection}>
        <div data-field="photo" className="flex items-center gap-3 border-b border-[#eef3f7] pb-5 sm:gap-4">
          <ImagePreviewDialog
            src={avatarPreview}
            alt={t("photoAlt")}
            open={photoMenuOpen}
            onOpenChange={setPhotoMenuOpen}
            openLabel={locale === "en" ? "View profile photo" : "Ver foto de perfil"}
            closeLabel={locale === "en" ? "Close" : "Cerrar"}
          >
            <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-[#eef8fd] text-[#009FD9] ring-1 ring-[#d8e6ef]">
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-6 w-6" />
              )}
            </span>
          </ImagePreviewDialog>

          <div className="min-w-0 flex-1">
            <p className="hidden text-sm font-semibold text-[#162543] sm:block">{t("photoAlt")}</p>
            <div className="grid grid-cols-2 items-center gap-2 sm:mt-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoUploading}
                className="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#d7e1ea] bg-white px-2 text-xs font-semibold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb] disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-3 sm:text-sm"
              >
                <Camera className="h-4 w-4 text-[#008fc3]" />
                {avatarPreview
                  ? (locale === "en" ? "Change photo" : "Cambiar foto")
                  : (locale === "en" ? "Add photo" : "Agregar foto")}
              </button>
              {avatarPreview && (
                <button
                  type="button"
                  onClick={handlePhotoRemove}
                  disabled={photoUploading}
                  className="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-red-200 bg-white px-2 text-xs font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-3 sm:text-sm"
                >
                  <X className="h-4 w-4" />
                  {locale === "en" ? "Remove photo" : "Quitar foto"}
                </button>
              )}
            </div>
          </div>

          <input
            ref={photoInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handlePhotoSelect(file);
              event.currentTarget.value = "";
            }}
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
              {t.rich("nameLockedHelp", { ...rich, link: (c) => <Link href="/dashboard/profesional?tab=verificacion" className="text-[#009FD9] font-medium hover:underline">{c}</Link> })}
            </p>
          </div>
        ) : (
          <Input
            label={<>{t("fullName")} <span className="text-red-500">*</span></>}
            value={fullName}
            error={dirty && activeDirtySection === "basic" && !fullName.trim()
              ? (locale === "en" ? "Full name is required." : "El nombre completo es obligatorio.")
              : undefined}
            maxLength={NAME_MAX_LENGTH}
            onChange={(e) => { setFullName(limitText(e.target.value, NAME_MAX_LENGTH)); touch("basic"); }}
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
            touch("basic");
          }}
          placeholder={t("businessPlaceholder")}
        />

        {/* Description */}
        <div data-field="bio">
          <label className="text-sm font-medium text-[#374151] block mb-1.5">{t("description")} <span className="text-red-500">*</span></label>
          <div className={`overflow-hidden rounded-xl border bg-white transition-all focus-within:border-transparent focus-within:ring-2 ${dirty && activeDirtySection === "basic" && !bio.trim() ? "border-red-400 focus-within:ring-red-400" : "border-[#e5e7eb] focus-within:ring-[#009FD9]"}`}>
            <textarea
              aria-invalid={dirty && activeDirtySection === "basic" && !bio.trim()}
              className="block min-h-[110px] w-full resize-none overflow-y-auto border-0 bg-transparent px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none"
              placeholder={t("descPlaceholder")}
              value={bio}
              maxLength={PROFILE_BIO_MAX_LENGTH}
              onChange={(e) => { setBio(limitText(e.target.value, PROFILE_BIO_MAX_LENGTH)); touch("basic"); }}
            />
          </div>
          {dirty && activeDirtySection === "basic" && !bio.trim() ? (
            <p className="mt-1 text-xs text-red-500">
              {locale === "en" ? "Description is required." : "La descripción es obligatoria."}
            </p>
          ) : null}
        </div>
      </Section>

      {/* Profesiones + servicios are managed in the "Profesiones" tab (consolidated
          there so they're not edited in two places). */}

      {/* ── Certificaciones — POR PROFESIÓN. Saved certs are read-only rows; a
             cert is ADDED via an explicit form whose "Guardar certificación"
             button requires all three fields. ─────── */}
      <Section footer={makeSectionFooter("certs")} id="certs" title={t("secCerts")} desc={t("secCertsDesc")} open={openSections.has("certs")} mobileFocused={mobileSectionFocused} onToggle={toggleSection} onActivate={setActiveDirtySection}>
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
                  <input type="text" value={certDraft!.name} maxLength={SHORT_TEXT_MAX_LENGTH} onChange={(e) => updateCertDraft("name", limitText(e.target.value, SHORT_TEXT_MAX_LENGTH))} placeholder={t("certNamePlaceholder")} className={inputCls} autoFocus />
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr,7rem] gap-2">
                    <input type="text" value={certDraft!.institution} maxLength={SHORT_TEXT_MAX_LENGTH} onChange={(e) => updateCertDraft("institution", limitText(e.target.value, SHORT_TEXT_MAX_LENGTH))} placeholder={t("certInstitution")} className={inputCls} />
                    <input type="text" inputMode="numeric" maxLength={4} value={certDraft!.year} onChange={(e) => updateCertDraft("year", e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder={t("certYear")} className={inputCls} />
                  </div>
                  {certError && <p className="text-xs text-red-600">{certError}</p>}
                  <div className="flex gap-2 pt-0.5">
                    <Button type="button" size="sm" onClick={saveCert}>{t("certSave")}</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={cancelCertDraft}>{t("cancel")}</Button>
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
      <Section footer={makeSectionFooter("location")} id="location" title={t("secLocation")} desc={t("secLocationDesc")} open={openSections.has("location")} mobileFocused={mobileSectionFocused} onToggle={toggleSection} onActivate={setActiveDirtySection}>
        {/* Work zones — provincia/cantón first (drives /buscar), optional exact pin. */}
        <div data-field="location">
          <label className="text-sm font-medium text-[#374151] block mb-2">
            {t("workplaces")} <span className="text-red-500">*</span>
          </label>
          {canOfferVideoConsult ? (
            <button
              type="button"
              role="switch"
              aria-checked={videoConsult && videoCoverageCountry}
              aria-label={t("videoConsultOption")}
              onClick={() => {
                const next = !(videoConsult && videoCoverageCountry);
                setVideoConsult(next);
                setVideoCoverageCountry(next);
                touch("location");
              }}
              className="mb-4 flex w-full items-center justify-between gap-4 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/35"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#111827]">{t("videoConsultOption")}</span>
                <span className="mt-0.5 block text-xs leading-5 text-[#64748b]">{t("videoCountryHelp")}</span>
              </span>
              <ToggleSwitch checked={videoConsult && videoCoverageCountry} />
            </button>
          ) : null}
          <WorkplacesPicker
            value={workplaces}
            onChange={(next) => { setWorkplaces(next); touch("location"); }}
            mapHeight={168}
          />
          {dirty && activeDirtySection === "location" && !hasWorkplace ? (
            <p className="mt-2 text-xs text-red-500">
              {locale === "en" ? "Add a workplace or enable video consultations." : "Agrega un lugar de trabajo o activa las videoconsultas."}
            </p>
          ) : null}
        </div>
      </Section>

      {/* ── Contacto ──────────────────────────────────────────────────── */}
      <Section footer={makeSectionFooter("contact")} id="contact" title={t("secContact")} desc={t("secContactDesc")} open={openSections.has("contact")} mobileFocused={mobileSectionFocused} onToggle={toggleSection} onActivate={setActiveDirtySection}>
        {/* WhatsApp — required contact channel. */}
        <div data-field="whatsapp">
          <PhoneInput
            label={t("whatsapp")}
            required
            value={whatsapp}
            error={dirty && activeDirtySection === "contact" && !isPhoneComplete(whatsapp)
              ? (locale === "en" ? "Enter a complete contact number." : "Ingresa un número de contacto completo.")
              : undefined}
            onChange={(digits) => { setWhatsapp(digits); touch("contact"); }}
            className="w-full sm:max-w-[32rem]"
          />
        </div>

        {/* Progressive disclosure: turning on "Permitir contacto por llamada"
            reveals the optional separate call line. Empty → the WhatsApp number
            is used for calls too (so the toggle alone is self-explanatory). */}
        <ProfileCheckRow
          title={t("allowCallLabel")}
          checked={allowPhoneCall}
          onToggle={() => {
            setAllowPhoneCall((v) => !v);
            touch("contact");
          }}
          ariaLabel={t("allowCallLabel")}
        />

        {allowPhoneCall && (
          <div>
            <PhoneInput
              label={<>{t("callNumber")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span></>}
              value={callPhone}
              error={dirty && activeDirtySection === "contact" && !callPhoneIsValid
                ? (locale === "en" ? "Enter a complete call number." : "Ingresa un número para llamadas completo.")
                : undefined}
              onChange={(digits) => { setCallPhone(digits); touch("contact"); }}
              className="w-full sm:max-w-[32rem]"
            />
            <p className="mt-1.5 text-xs text-[#6b7280]">{t("callNumberHelp")}</p>
          </div>
        )}

        {/* Optional public contact email — opt-in via a toggle (consistent with the
            call-number pattern). Off → no email is shown; turning it off clears it. */}
        <ProfileCheckRow
          title={t("allowEmailLabel")}
          checked={showContactEmail}
          onToggle={() => {
            setShowContactEmail((v) => {
              const nv = !v;
              if (nv && !contactEmail.trim() && accountEmail) setContactEmail(accountEmail);
              return nv;
            });
            touch("contact");
          }}
          ariaLabel={t("allowEmailLabel")}
        />

        {showContactEmail && (
          <div className="w-full sm:max-w-[40rem]">
            <input
              type="email"
              inputMode="email"
              placeholder={t("emailPlaceholder")}
              value={contactEmail}
              aria-invalid={dirty && activeDirtySection === "contact" && !emailIsValid}
              onChange={(e) => { setContactEmail(e.target.value); touch("contact"); }}
              className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
            />
            {contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim()) && (
              <p className="text-xs text-red-500 mt-1">{t("emailInvalid")}</p>
            )}
          </div>
        )}
      </Section>

      {/* ── Redes sociales — USERNAME only; we build the link (additive to casos). ── */}
      <Section footer={makeSectionFooter("social")} id="social" title={t("secSocial")} desc={t("secSocialDesc")} open={openSections.has("social")} mobileFocused={mobileSectionFocused} onToggle={toggleSection} onActivate={setActiveDirtySection}>
        <div className="flex flex-col gap-3">
          <div className="w-full sm:max-w-[40rem]">
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
              onChange={(e) => { setWebsite(e.target.value.slice(0, 120)); touch("social"); }}
              className={`h-11 w-full rounded-xl border bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[#009FD9] ${website.trim() && !isValidWebsiteUrl(website) ? "border-red-300" : "border-[#e5e7eb]"}`}
            />
            {website.trim() && !isValidWebsiteUrl(website) && <p className="text-xs text-red-500 mt-1">{t("websiteInvalid")}</p>}
          </div>
          {SOCIAL_NETWORKS.map(({ key, label, prefix }) => {
            const Icon = { instagram: InstagramIcon, facebook: FacebookIcon, tiktok: TikTokIcon, linkedin: LinkedInIcon }[key];
            const cleaned = cleanUsername(social[key]);
            const invalid = cleaned.length > 0 && !isValidUsername(cleaned);
            return (
              <div key={key} className="w-full sm:max-w-[40rem]">
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
                    onChange={(e) => { setSocial((s) => ({ ...s, [key]: e.target.value.slice(0, 50) })); touch("social"); }}
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
      <Section footer={makeSectionFooter("lang")} id="lang" title={isHealthPro ? t("secLangInsurers") : t("secLang")} desc={t("secLangDesc")} open={openSections.has("lang")} mobileFocused={mobileSectionFocused} onToggle={toggleSection} onActivate={setActiveDirtySection}>
        {/* Languages — defaults to Español; extra languages are an optional bonus */}
        <div>
          <label className="text-sm font-medium text-[#374151] block mb-1.5">
            {t("languagesSpoken")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
          </label>
          <LanguagesInput value={languages} onChange={(next) => { setLanguages(next); touch("lang"); }} />
        </div>

        {/* Aseguradoras — ONLY for health (es_salud) professionals */}
        {isHealthPro && (
          <div data-field="insurers">
            <label className="text-sm font-medium text-[#374151] block mb-1.5">
              {t("insurers")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
            </label>
            <p className="text-xs text-[#9ca3af] mb-2">{t("insurersHelp")}</p>
            <AseguradorasInput value={insurers} onChange={(next) => { setInsurers(next); touch("lang"); }} />
          </div>
        )}
      </Section>

      {extraSections.map((section) => (
        <Section
          footer={section.footer === undefined ? makeSectionFooter(section.id) : section.footer}
          key={section.id}
          id={section.id}
          title={section.title}
          desc={section.desc}
          open={openSections.has(section.id)}
          mobileFocused={mobileSectionFocused}
          onToggle={toggleSection}
          onActivate={setActiveDirtySection}
        >
          {section.children}
        </Section>
      ))}
      </div>
      </div>

      {/* Contact preference lives in the Disponibilidad tab now. */}


      {/* Designed unsaved-changes dialog (replaces the browser default) */}
      <UnsavedChangesGuard
        dirty={dirty}
        onSave={() => handleSave()}
        onDiscard={cancelChanges}
        validationError={sectionValidationError(activeDirtySection)}
      />
    </div>
  );
}
