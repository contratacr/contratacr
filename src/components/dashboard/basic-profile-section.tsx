"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Lock, Camera, X, Info, Briefcase, ChevronDown } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { detectIdType } from "@/lib/cedula";
import { Button } from "@/components/ui/button";
import { ImagePreviewDialog } from "@/components/ui/image-preview-dialog";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { canOffer } from "@/lib/auth/capabilities";
import { cn, getInitials } from "@/lib/utils";
import { PhoneInput, hasPhoneNumber, isPhoneComplete } from "@/components/ui/phone-input";
import { SaveStatus } from "@/components/dashboard/save-status";
import { UnsavedChangesGuard } from "@/components/dashboard/unsaved-changes-guard";
import { NAME_MAX_LENGTH, limitText } from "@/lib/text-limits";
import { IMAGE_ACCEPT } from "@/lib/upload-validation";
import { getImageUploadPreparationErrorCode, prepareImageForUpload } from "@/lib/client-image-upload";
import { useAppDialog } from "@/hooks/use-app-dialog";

type ExtraProfileSection = {
  id: string;
  title: string;
  desc?: string;
  children: React.ReactNode;
};

function ProfileSection({
  id,
  title,
  desc,
  open,
  onToggle,
  children,
}: ExtraProfileSection & { open: boolean; onToggle: (id: string) => void }) {
  return (
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

// The SEEKER's "Mi perfil" — basic identity every account has (photo + name +
// phone), with the same reliable autosave standard as the rest of the app. Used
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
  const profileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileDirtyRef = useRef(false);
  const discardEditRef = useRef(false);
  const profileFormRef = useRef(profileForm);
  const saveProfileRef = useRef<() => Promise<void>>(async () => {});
  const [photoUploading, setPhotoUploading] = useState(false);
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["basic"]));
  const toggleSection = (id: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  function touchProfile() {
    discardEditRef.current = false;
    setProfileSaved(false);
    setProfileDirty(true);
    profileDirtyRef.current = true;
    if (profileTimer.current) clearTimeout(profileTimer.current);
    profileTimer.current = setTimeout(() => { void saveProfile(); }, 1000);
  }
  function flushProfile() {
    if (profileTimer.current) { clearTimeout(profileTimer.current); profileTimer.current = null; }
    if (profileDirtyRef.current) void saveProfile();
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
    if (discardEditRef.current) {
      profileDirtyRef.current = false;
      setProfileDirty(false);
      setProfileSaved(false);
      return;
    }
    if (!user) return;
    const currentForm = profileFormRef.current;
    setProfileDirty(false);
    setProfileSaving(true);
    const supabase = createClient();
    // Never overwrite a verified official name (locked; corrections go through admin).
    const verified = profileData?.client_identity_status === "verified";
    const cleanPhone = isPhoneComplete(currentForm.phone) ? currentForm.phone : null;
    const update: Record<string, string | null> = { phone: cleanPhone };
    const cleanName = limitText(currentForm.full_name.trim(), NAME_MAX_LENGTH);
    if (!verified) update.full_name = cleanName;
    const { error: profileError } = await supabase.from("profiles").update(update).eq("id", user.id);
    if (profileError) {
      setProfileSaving(false);
      void showMessage({ title: errorTitle, description: locale === "en" ? "We couldn't save your profile. Try again." : "No pudimos guardar tu perfil. Intenta de nuevo.", tone: "danger" });
      return;
    }
    if (cleanPhone) {
      const { error: professionalPhoneError } = await supabase.from("professionals").update({ whatsapp: cleanPhone }).eq("profile_id", user.id);
      if (professionalPhoneError) {
        setProfileSaving(false);
        void showMessage({ title: errorTitle, description: locale === "en" ? "We couldn't sync your contact number. Try again." : "No pudimos sincronizar tu número de contacto. Intenta de nuevo.", tone: "danger" });
        return;
      }
    }
    if (!verified && cleanName) {
      await supabase.auth.updateUser({ data: { full_name: cleanName } });
    }
    setProfileData((prev) => (prev ? { ...prev, phone: cleanPhone ?? "", ...(!verified && cleanName ? { full_name: cleanName } : {}) } : prev));
    window.dispatchEvent(new Event("ccr:profile-updated"));
    setProfileSaving(false);
    setProfileSaved(true);
    profileDirtyRef.current = false;
    setTimeout(() => setProfileSaved(false), 3000);
  }, [errorTitle, locale, profileData?.client_identity_status, showMessage, user]);
  useEffect(() => {
    profileFormRef.current = profileForm;
    saveProfileRef.current = saveProfile;
  }, [profileForm, saveProfile]);

  // Flush a pending save on unmount (e.g. switching tabs) — the data-loss fix.
  useEffect(() => () => {
    if (profileTimer.current) clearTimeout(profileTimer.current);
    if (profileDirtyRef.current) void saveProfileRef.current?.();
  }, []);

  function discardPendingChanges() {
    discardEditRef.current = true;
    if (profileTimer.current) {
      clearTimeout(profileTimer.current);
      profileTimer.current = null;
    }
    profileDirtyRef.current = false;
    setProfileDirty(false);
    setProfileSaved(false);
  }

  async function handlePhotoRemove() {
    if (!user) return;
    const supabase = createClient();
    await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    await supabase.auth.updateUser({ data: { avatar_url: null } });
    setProfileAvatar(null);
    window.dispatchEvent(new Event("ccr:profile-updated"));
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const input = e.currentTarget;
    setPhotoUploading(true);
    try {
      const preparedFile = await prepareImageForUpload(file, { maxDimension: 1200 });
      const fd = new FormData();
      fd.append("file", preparedFile);
      fd.append("type", "avatar");
      const res = await fetch("/api/upload/photo", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        void showMessage({ title: errorTitle, description: j.error || t("photoError"), tone: "danger" });
        return;
      }
      const { url } = await res.json();
      const supabase = createClient();
      await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      await supabase.auth.updateUser({ data: { avatar_url: url } });
      setProfileAvatar(url);
      window.dispatchEvent(new Event("ccr:profile-updated"));
    } catch (error) {
      const code = getImageUploadPreparationErrorCode(error);
      void showMessage({ title: errorTitle, description: code === "too_large" ? t("photoTooLarge") : code === "unsupported" ? t("photoUnsupported") : t("photoError"), tone: "danger" });
    } finally {
      setPhotoUploading(false);
      input.value = "";
    }
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

  return (
    <div className="flex flex-col gap-4">
      {/* Autosave status pinned top-right of the section. */}
      <div className="relative">
        <div className="pointer-events-none absolute right-0 -top-1">
          <SaveStatus saving={profileSaving} saved={profileSaved} dirty={profileDirty} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm divide-y divide-[#eef0f2]">
      <ProfileSection id="basic" title={t("secBasic")} desc={t("secBasicDesc")} open={openSections.has("basic")} onToggle={toggleSection}>
      {/* Foto */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#EBF5FB]">
          <ImagePreviewDialog
            src={profileAvatar}
            alt={locale === "en" ? "Profile photo" : "Foto de perfil"}
            openLabel={locale === "en" ? "View profile photo" : "Ver foto de perfil"}
            closeLabel={locale === "en" ? "Close" : "Cerrar"}
          >
            {profileAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profileAvatar} alt={locale === "en" ? "Profile photo" : "Foto"} className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <span className="text-xl font-bold text-[#009FD9]">{getInitials(displayName)}</span>
            )}
          </ImagePreviewDialog>
          {photoUploading && (
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
              <span className="h-5 w-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            </div>
          )}
        </div>
        {profileAvatar ? (
          <div className="min-w-[13rem] flex-1 basis-[13rem] flex flex-nowrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()} disabled={photoUploading} className="px-3">
              <Camera className="h-4 w-4" /> {t("changePhoto")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handlePhotoRemove} disabled={photoUploading} className="shrink-0 px-2.5 text-red-500 hover:text-red-600">
              <X className="h-4 w-4" /> {t("removePhoto")}
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>
            <Camera className="h-4 w-4" /> {t("addPhoto")}
          </Button>
        )}
        <input ref={photoInputRef} type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={handlePhotoUpload} disabled={photoUploading} />
      </div>

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
              onBlur={flushProfile}
            />
            {cedulaVerified && <Lock className="h-4 w-4 text-[#9ca3af] absolute right-3 top-1/2 -translate-y-1/2" />}
          </div>
          {cedulaVerified && (
            <p className="text-xs text-[#6b7280] mt-1.5">
              {t.rich("nameLockedHelp", { link: (c) => <Link href={supportTab} className="text-[#009FD9] font-medium hover:underline">{c}</Link> })}
            </p>
          )}
        </div>
        <div>
          <PhoneInput
            label={<>{t("phone")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span></>}
            value={profileForm.phone}
            onChange={(digits) => { setProfileForm((f) => ({ ...f, phone: digits })); touchProfile(); }}
          />
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-[#6b7280]">
            <Info className="h-3.5 w-3.5 shrink-0 mt-px text-[#9ca3af]" />
            <span>{t("phoneNotice")}</span>
          </p>
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
          onToggle={toggleSection}
        >
          {section.children}
        </ProfileSection>
      ))}
      </div>

      <UnsavedChangesGuard
        dirty={profileDirty}
        onSave={saveProfile}
        onDiscard={discardPendingChanges}
        isBusy={profileSaving}
      />
      {dialogNode}
    </div>
  );
}
