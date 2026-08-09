"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Lock, Camera, X, Info, Briefcase, ChevronDown, ChevronLeft, Pencil, Eye, Trash2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { detectIdType } from "@/lib/cedula";
import { Button } from "@/components/ui/button";
import { ImagePreviewDialog } from "@/components/ui/image-preview-dialog";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { canOffer } from "@/lib/auth/capabilities";
import { cn, getInitials } from "@/lib/utils";
import { PhoneInput, hasPhoneNumber, isPhoneComplete } from "@/components/ui/phone-input";
import { UnsavedChangesGuard } from "@/components/dashboard/unsaved-changes-guard";
import { useReportSaveStatus } from "@/components/dashboard/save-status-context";
import { NAME_MAX_LENGTH, limitText } from "@/lib/text-limits";
import { IMAGE_ACCEPT } from "@/lib/upload-validation";
import { getImageUploadPreparationErrorCode, prepareImageForUpload, uploadPhotoFormDataWithRetry } from "@/lib/client-image-upload";
import { useAppDialog } from "@/hooks/use-app-dialog";

type ExtraProfileSection = {
  id: string;
  title: string;
  desc?: string;
  children: React.ReactNode;
  footer?: React.ReactNode | null;
};

function ProfileSection({
  id,
  title,
  desc,
  open,
  mobileFocused,
  onToggle,
  onActivate,
  children,
  footer,
}: ExtraProfileSection & { open: boolean; mobileFocused?: boolean; onToggle: (id: string) => void; onActivate?: (id: string) => void }) {
  return (
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
        <div className="border-t border-[#f3f4f6] px-4 pb-5 pt-4 sm:px-5" onFocusCapture={() => onActivate?.(id)} onPointerDownCapture={() => onActivate?.(id)}>
          <div className="flex flex-col gap-4 rounded-2xl border border-[#eef2f6] bg-[#fbfcfd] px-3 py-3 sm:border-0 sm:bg-transparent sm:p-0">
            {children}
          </div>
          {footer}
        </div>
      )}
    </div>
  );
}

// The SEEKER's "Mi perfil" — basic identity every account has (photo + name +
// phone), with manual Guardar/Cancelar controls. Used
// by the unified panel's "Usar servicios" mode. The "Ofrecer servicios" invitation
// lives in the panel sidebar, so it is not repeated here.
export function BasicProfileSection({
  supportTab = "/dashboard/profesional?tab=soporte",
  extraSections = [],
}: {
  supportTab?: string;
  extraSections?: ExtraProfileSection[];
}) {
  const { user } = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("clientPage");
  const { dialogNode, showMessage } = useAppDialog();
  const errorTitle = locale === "en" ? "Something went wrong" : "No se pudo completar la acción";
  // A client-only account (offering not unlocked) gets the "Ofrecer mis servicios"
  // invitation at the END of this section — that's how they start offering.
  const userCanOffer = canOffer(user);

  const [profileData, setProfileData] = useState<{ full_name: string; phone?: string; avatar_url?: string; cedula?: string | null; client_identity_status?: "verified" | "pending" | "unverified" | null } | null>(null);
  const [profileForm, setProfileForm] = useState({ full_name: "", phone: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const [activeDirtySection, setActiveDirtySection] = useState<string | null>(null);
  const profileDirtyRef = useRef(false);
  const profileFormRef = useRef(profileForm);
  const saveProfileSeq = useRef(0);
  const mountedRef = useRef(true);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const toggleSection = (id: string) =>
    setOpenSections((prev) => {
      if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
        return prev.has(id) ? new Set() : new Set([id]);
      }
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  function touchProfile(sectionId?: string) {
    setProfileSaved(false);
    setProfileDirty(true);
    if (sectionId) setActiveDirtySection(sectionId);
    profileDirtyRef.current = true;
  }

  const loadProfile = useCallback(() => {
    if (!user) return;
    const supabase = createClient();
    supabase.rpc("get_my_profile").then(async ({ data }) => {
      if (!data) return;
      let phone = data.phone ?? "";
      // Legacy/professional-first accounts may have the number only on the
      // professional profile; prefill it here and sync on the next valid save.
      if (!hasPhoneNumber(phone)) {
        const { data: pro } = await supabase.from("professionals").select("whatsapp").eq("profile_id", user.id).maybeSingle();
        const wa = (pro?.whatsapp as string | undefined) ?? "";
        if (hasPhoneNumber(wa)) {
          phone = wa;
        }
      }
      setProfileData({ ...data, phone });
      setProfileAvatar(data.avatar_url ?? null);
      // Never clobber an in-progress edit (token refresh / profile-updated re-fetch).
      if (!profileDirtyRef.current) {
        setProfileForm({ full_name: data.full_name ?? "", phone });
      }
    });
  }, [user]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const saveProfile = useCallback(async () => {
    if (!user) return;
    const seq = ++saveProfileSeq.current;
    const isCurrentSave = () => mountedRef.current && seq === saveProfileSeq.current;
    const currentForm = profileFormRef.current;
    if (mountedRef.current) {
      setProfileDirty(false);
      setActiveDirtySection(null);
      setProfileSaving(true);
    }
    const supabase = createClient();
    // Never overwrite a verified official name (locked; corrections go through admin).
    const verified = profileData?.client_identity_status === "verified";
    const cleanPhone = isPhoneComplete(currentForm.phone) ? currentForm.phone : null;
    const update: Record<string, string | null> = { phone: cleanPhone };
    const cleanName = limitText(currentForm.full_name.trim(), NAME_MAX_LENGTH);
    if (!verified) update.full_name = cleanName;
    const { error: profileError } = await supabase.from("profiles").update(update).eq("id", user.id);
    if (profileError) {
      if (isCurrentSave()) {
        setProfileSaving(false);
        void showMessage({ title: errorTitle, description: locale === "en" ? "We couldn't save your profile. Try again." : "No pudimos guardar tu perfil. Intenta de nuevo.", tone: "danger" });
      }
      return;
    }
    if (!verified && cleanName) {
      const { error: authError } = await supabase.auth.updateUser({ data: { full_name: cleanName } });
      if (authError) console.warn("[basic-profile] auth metadata sync failed:", authError.message);
    }
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
        const { error: profilePhotoError } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
        if (profilePhotoError) throw new Error(t("photoError"));
        const { error: authPhotoError } = await supabase.auth.updateUser({ data: { avatar_url: url } });
        if (authPhotoError) throw new Error(t("photoError"));
        setProfileAvatar(url);
        setPendingAvatarFile(null);
      } catch (error) {
        const code = getImageUploadPreparationErrorCode(error);
        void showMessage({ title: errorTitle, description: code === "too_large" ? t("photoTooLarge") : code === "unsupported" ? t("photoUnsupported") : error instanceof Error && error.message ? error.message : t("photoError"), tone: "danger" });
        setProfileSaving(false);
        setPhotoUploading(false);
        return;
      } finally {
        setPhotoUploading(false);
      }
    } else if (profileAvatar === null && profileData?.avatar_url) {
      await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
      await supabase.auth.updateUser({ data: { avatar_url: null } });
    }
    window.dispatchEvent(new Event("ccr:profile-updated"));
    if (isCurrentSave()) {
      setProfileData((prev) => (prev ? { ...prev, phone: cleanPhone ?? "", ...(!verified && cleanName ? { full_name: cleanName } : {}) } : prev));
      setProfileSaving(false);
      setProfileSaved(true);
      setActiveDirtySection(null);
      profileDirtyRef.current = false;
      setTimeout(() => {
        if (isCurrentSave()) setProfileSaved(false);
      }, 3000);
    }
  }, [errorTitle, locale, pendingAvatarFile, profileAvatar, profileData?.avatar_url, profileData?.client_identity_status, showMessage, t, user]);
  useEffect(() => {
    profileFormRef.current = profileForm;
  }, [profileForm]);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  useReportSaveStatus(profileSaving, profileSaved, profileDirty);

  function handlePhotoRemove() {
    setProfileAvatar(null);
    setPendingAvatarFile(null);
    touchProfile("basic");
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const input = e.currentTarget;
    setProfileAvatar(URL.createObjectURL(file));
    setPendingAvatarFile(file);
    touchProfile("basic");
    input.value = "";
  }

  const displayName =
    profileData?.full_name ||
    (user?.user_metadata?.full_name as string) ||
    user?.email?.split("@")[0] ||
    t("clientFallback");

  const savedCedula = profileData?.cedula ? String(profileData.cedula) : "";
  const cedulaVerified = profileData?.client_identity_status === "verified" || (!!savedCedula && detectIdType(savedCedula) === "cedula" && !profileData?.client_identity_status);

  const inputClass =
    "w-full h-10 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

  function cancelProfileChanges() {
    if (!profileData) return;
    setProfileForm({ full_name: profileData.full_name ?? "", phone: profileData.phone ?? "" });
    setProfileAvatar(profileData.avatar_url ?? null);
    setPendingAvatarFile(null);
    setProfileSaved(false);
    setProfileDirty(false);
    setActiveDirtySection(null);
    profileDirtyRef.current = false;
  }

  const makeProfileFooter = (sectionId: string) => {
    const sectionActive = profileDirty && activeDirtySection === sectionId;
    return (
      <div className="mt-5 flex flex-col gap-2 border-t border-[#f3f4f6] pt-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={cancelProfileChanges}
          disabled={!sectionActive || profileSaving || photoUploading}
          className="hidden h-10 rounded-xl px-4 text-sm font-semibold text-[#374151] transition-colors hover:bg-[#f3f4f6] disabled:cursor-not-allowed disabled:opacity-45 sm:inline-flex sm:items-center sm:justify-center"
        >
          {locale === "en" ? "Cancel" : "Cancelar"}
        </button>
        <button
          type="button"
          onClick={() => void saveProfile()}
          disabled={!sectionActive || profileSaving || photoUploading}
          className="h-10 w-full rounded-xl bg-[#009FD9] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0089bb] disabled:cursor-not-allowed disabled:bg-[#cbd5e1] disabled:text-white sm:w-auto"
        >
          {profileSaving || photoUploading ? (locale === "en" ? "Saving..." : "Guardando...") : locale === "en" ? "Save changes" : "Guardar cambios"}
        </button>
      </div>
    );
  };
  const mobileSectionFocused = openSections.size > 0;
  const activeMobileSectionId = Array.from(openSections)[0] ?? null;
  const activeMobileSectionTitle =
    activeMobileSectionId === "basic"
      ? t("secBasic")
      : extraSections.find((section) => section.id === activeMobileSectionId)?.title ?? null;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("ccr:profile-mobile-section-title", { detail: mobileSectionFocused ? activeMobileSectionTitle : null }));
  }, [activeMobileSectionTitle, mobileSectionFocused]);

  useEffect(() => {
    const close = () => setOpenSections(new Set());
    window.addEventListener("ccr:profile-mobile-close-section", close);
    return () => window.removeEventListener("ccr:profile-mobile-close-section", close);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-none flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border border-[#dfe8f0] bg-white shadow-[0_10px_28px_-24px_rgba(15,23,42,0.65)]">
      <div className="divide-y divide-[#eef3f7]">
      <div className="hidden px-4 pb-4 pt-5 sm:block sm:px-5 sm:pt-6">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-[#111827]">{locale === "en" ? "Profile" : "Perfil"}</h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            {locale === "en"
              ? "Complete your basic information and keep your account up to date."
              : "Completa tu información básica y mantén tu cuenta al día."}
          </p>
        </div>
      </div>
      <ProfileSection id="basic" title={t("secBasic")} desc={t("secBasicDesc")} open={openSections.has("basic")} mobileFocused={mobileSectionFocused} onToggle={toggleSection} onActivate={setActiveDirtySection} footer={makeProfileFooter("basic")}>
      {/* Datos — nombre + teléfono */}
      <div className="border-t border-[#f3f4f6] pt-5 flex flex-col gap-4">
        <div>
          <label className="text-sm font-medium text-[#374151] mb-1.5 flex items-center gap-1.5">
            {t("fullName")} <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              className={cn(inputClass, cedulaVerified && "bg-[#f3f4f6] cursor-not-allowed pr-10")}
              value={profileForm.full_name}
              disabled={cedulaVerified}
              maxLength={NAME_MAX_LENGTH}
              onChange={(e) => { setProfileForm((f) => ({ ...f, full_name: limitText(e.target.value, NAME_MAX_LENGTH) })); touchProfile(); }}
            />
            {cedulaVerified && <Lock className="h-4 w-4 text-[#9ca3af] absolute right-3 top-1/2 -translate-y-1/2" />}
          </div>
          {cedulaVerified && (
            <p className="text-xs text-[#6b7280] mt-1.5">
              {t.rich("nameLockedHelp", { link: (c) => <Link href="/dashboard/profesional?tab=verificacion" className="text-[#009FD9] font-medium hover:underline">{c}</Link> })}
            </p>
          )}
        </div>
        <div>
          <PhoneInput
            label={<>{t("phone")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span></>}
            value={profileForm.phone}
            onChange={(digits) => { setProfileForm((f) => ({ ...f, phone: digits })); touchProfile(); }}
          />
        </div>

        {/* NO cédula verification SECTION here (sprint 513). A client gets verified by
            providing their cédula at solicitud/booking; the "Verificado" badge then shows
            BELOW THEIR NAME in the panel header — same as the professional side. The official
            name stays locked once verified (above). */}
      </div>

      {/* Ofrecer mis servicios — at the END of "Mi perfil". A client-only account
          discovers offering here (same account, no mode switch yet — this is how they
          start). Hidden once the account can offer. Minimal: a short prompt + button. */}
      {!userCanOffer && (
        <div className="border-t border-[#f3f4f6] pt-5">
          <h3 className="text-sm font-semibold text-[#111827]">{t("offerTitle")}</h3>
          <p className="text-xs text-[#6b7280] mt-0.5 mb-3">{t("offerBody")}</p>
          <Button size="sm" onClick={() => router.push("/registro/profesional")}>
            <Briefcase className="h-4 w-4" /> {t("offerCta")}
          </Button>
        </div>
      )}
      </ProfileSection>

      {extraSections.map((section) => (
        <ProfileSection
          key={section.id}
          id={section.id}
          title={section.title}
          desc={section.desc}
          open={openSections.has(section.id)}
          mobileFocused={mobileSectionFocused}
          onToggle={toggleSection}
          onActivate={setActiveDirtySection}
          footer={section.footer === undefined ? makeProfileFooter(section.id) : section.footer}
        >
          {section.children}
        </ProfileSection>
      ))}
      </div>
      </div>

      <UnsavedChangesGuard dirty={profileDirty} onSave={saveProfile} onDiscard={cancelProfileChanges} />
      {dialogNode}
    </div>
  );
}

