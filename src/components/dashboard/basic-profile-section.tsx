"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, Camera, X, Briefcase, Info } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { detectIdType } from "@/lib/cedula";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn, getInitials } from "@/lib/utils";
import { PhoneInput, hasPhoneNumber } from "@/components/ui/phone-input";
import { SaveStatus } from "@/components/dashboard/save-status";
import { UnsavedChangesGuard } from "@/components/dashboard/unsaved-changes-guard";

// The SEEKER's "Mi perfil" — basic identity every account has (photo + name +
// phone), with the same reliable autosave standard as the rest of the app. Used
// by the unified panel's "Usar servicios" mode. When the account has NOT yet
// unlocked offering, it also shows the "Ofrecer mis servicios" activation card.
export function BasicProfileSection({
  canOffer,
  supportTab = "/dashboard/profesional?tab=soporte",
}: {
  canOffer: boolean;
  supportTab?: string;
}) {
  const { user } = useAuth();
  const t = useTranslations("clientPage");
  const router = useRouter();

  const [profileData, setProfileData] = useState<{ full_name: string; phone?: string; avatar_url?: string; cedula?: string | null } | null>(null);
  const [profileForm, setProfileForm] = useState({ full_name: "", phone: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const profileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileDirtyRef = useRef(false);
  const saveProfileRef = useRef<() => Promise<void>>(async () => {});
  const [photoUploading, setPhotoUploading] = useState(false);
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  function touchProfile() {
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
    supabase.rpc("get_my_profile").then(({ data }) => {
      if (data) {
        setProfileData(data);
        setProfileAvatar(data.avatar_url ?? null);
        // Never clobber an in-progress edit (token refresh / profile-updated re-fetch).
        if (!profileDirtyRef.current) {
          setProfileForm({ full_name: data.full_name ?? "", phone: data.phone ?? "" });
        }
      }
    });
  }, [user]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  async function saveProfile() {
    if (!user) return;
    setProfileDirty(false);
    setProfileSaving(true);
    const supabase = createClient();
    // Never overwrite a verified official name (locked; corrections go through admin).
    const verified = !!profileData?.cedula && detectIdType(String(profileData.cedula)) === "cedula";
    const update: Record<string, string | null> = { phone: hasPhoneNumber(profileForm.phone) ? profileForm.phone : null };
    if (!verified) update.full_name = profileForm.full_name;
    await supabase.from("profiles").update(update).eq("id", user.id);
    if (!verified && profileForm.full_name) {
      await supabase.auth.updateUser({ data: { full_name: profileForm.full_name } });
      setProfileData((prev) => (prev ? { ...prev, full_name: profileForm.full_name } : prev));
      window.dispatchEvent(new Event("ccr:profile-updated"));
    }
    setProfileSaving(false);
    setProfileSaved(true);
    profileDirtyRef.current = false;
    setTimeout(() => setProfileSaved(false), 3000);
  }
  saveProfileRef.current = saveProfile;

  // Flush a pending save on unmount (e.g. switching tabs) — the data-loss fix.
  useEffect(() => () => {
    if (profileTimer.current) clearTimeout(profileTimer.current);
    if (profileDirtyRef.current) void saveProfileRef.current?.();
  }, []);

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
    setPhotoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "avatar");
      const res = await fetch("/api/upload/photo", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || t("photoError"));
        return;
      }
      const { url } = await res.json();
      const supabase = createClient();
      await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      await supabase.auth.updateUser({ data: { avatar_url: url } });
      setProfileAvatar(url);
      window.dispatchEvent(new Event("ccr:profile-updated"));
    } catch {
      alert(t("photoError"));
    } finally {
      setPhotoUploading(false);
    }
  }

  const displayName =
    profileData?.full_name ||
    (user?.user_metadata?.full_name as string) ||
    user?.email?.split("@")[0] ||
    t("clientFallback");

  const savedCedula = profileData?.cedula ? String(profileData.cedula) : "";
  const cedulaVerified = !!savedCedula && detectIdType(savedCedula) === "cedula";

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

      {/* Foto */}
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 rounded-full overflow-hidden bg-[#EBF5FB] flex items-center justify-center shrink-0">
          {profileAvatar ? (
            <img src={profileAvatar} alt="Foto" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[#009FD9] font-bold text-xl">{getInitials(displayName)}</span>
          )}
          {photoUploading && (
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
              <span className="h-5 w-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            </div>
          )}
        </div>
        {profileAvatar ? (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>
              <Camera className="h-4 w-4" /> {t("changePhoto")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handlePhotoRemove} disabled={photoUploading} className="text-red-500 hover:text-red-600">
              <X className="h-4 w-4" /> {t("removePhoto")}
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>
            <Camera className="h-4 w-4" /> {t("addPhoto")}
          </Button>
        )}
        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={photoUploading} />
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
              onChange={(e) => { setProfileForm((f) => ({ ...f, full_name: e.target.value })); touchProfile(); }}
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
      </div>

      {/* Ofrecer mis servicios — same account, unlock the offering capability.
          Only shown when the account hasn't unlocked offering yet. */}
      {!canOffer && (
        <div className="border-t border-[#f3f4f6] pt-5">
          <h3 className="text-sm font-semibold text-[#111827]">{t("offerTitle")}</h3>
          <p className="text-xs text-[#6b7280] mt-0.5 mb-3">{t("offerBody")}</p>
          <Button size="sm" onClick={() => router.push("/registro/profesional")}>
            <Briefcase className="h-4 w-4" /> {t("offerCta")}
          </Button>
        </div>
      )}

      <UnsavedChangesGuard dirty={profileDirty} onSave={saveProfile} />
    </div>
  );
}
