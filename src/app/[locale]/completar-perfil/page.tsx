"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { User as UserIcon, AlertCircle, Camera } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { useRouter } from "@/i18n/navigation";
import { CedulaInput } from "@/components/ui/cedula-input";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { isSigningOut } from "@/lib/auth/sign-out";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { NAME_MAX_LENGTH, limitText } from "@/lib/text-limits";
import { IMAGE_ACCEPT } from "@/lib/upload-validation";
import { getImageUploadPreparationErrorCode, prepareImageForUpload, uploadPhotoFormDataWithRetry } from "@/lib/client-image-upload";
import { deleteOwnedMediaUrl } from "@/lib/client-media-cleanup";

// Mandatory profile completion for OAuth (Facebook/Google) users who never
// provided a cédula. Required before they can book.
export default function CompleteProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations("completeProfile");
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard/profesional?mode=use";

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [cedula, setCedula] = useState("");
  const [nameFromOAuth, setNameFromOAuth] = useState(false);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoPreviewObjectUrlRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (photoPreviewObjectUrlRef.current) URL.revokeObjectURL(photoPreviewObjectUrlRef.current);
  }, []);

  useEffect(() => {
    if (!authLoading && !user && !isSigningOut()) router.push("/login");
  }, [user, authLoading, router]);

  // Load existing profile; if cédula already present, skip this screen.
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    // Own profile incl. cédula/phone via the SECURITY DEFINER RPC (sensitive
    // columns are no longer directly selectable — see migration 047).
    supabase
      .rpc("get_my_profile")
      .then(({ data }) => {
        if (data?.cedula && data.cedula.trim() !== "") {
          router.replace(next.startsWith("/") ? next.replace(/^\/[a-z]{2}(?=\/)/, "") : next);
          return;
        }
        const oauthName =
          data?.full_name ||
          (user.user_metadata?.full_name as string) ||
          (user.user_metadata?.name as string) ||
          "";
        setFullName(limitText(oauthName, NAME_MAX_LENGTH));
        setNameFromOAuth(!!oauthName);
        setPhone(data?.phone ?? "");
        setAvatarUrl(
          data?.avatar_url ||
            (user.user_metadata?.avatar_url as string) ||
            (user.user_metadata?.picture as string) ||
            null
        );
        setChecking(false);
      });
  }, [user, router, next]);

  // Optional profile photo — auto-uploads immediately on selection.
  async function handlePhotoSelect(file: File) {
    if (!user) return;
    const previousAvatarUrl = avatarUrl;
    setError(null);
    if (photoPreviewObjectUrlRef.current) URL.revokeObjectURL(photoPreviewObjectUrlRef.current);
    const previewUrl = URL.createObjectURL(file);
    photoPreviewObjectUrlRef.current = previewUrl;
    setAvatarUrl(previewUrl);
    setPhotoUploading(true);
    try {
      const preparedFile = await prepareImageForUpload(file, { maxDimension: 1200 });
      const fd = new FormData();
      fd.append("file", preparedFile);
      fd.append("type", "avatar");
      const upload = await uploadPhotoFormDataWithRetry(fd);
      if (!upload.ok || !upload.data.url) throw new Error(upload.data.error || t("photoError"));
      const { url } = upload.data;
      const supabase = createClient();
      const { error: profileError } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      if (profileError) throw profileError;
      const { error: authError } = await supabase.auth.updateUser({ data: { avatar_url: url } });
      if (authError) throw authError;
      if (previousAvatarUrl !== url) await deleteOwnedMediaUrl(previousAvatarUrl).catch(() => false);
      URL.revokeObjectURL(previewUrl);
      if (photoPreviewObjectUrlRef.current === previewUrl) photoPreviewObjectUrlRef.current = null;
      setAvatarUrl(url);
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      if (photoPreviewObjectUrlRef.current === previewUrl) photoPreviewObjectUrlRef.current = null;
      const code = getImageUploadPreparationErrorCode(error);
      setAvatarUrl(previousAvatarUrl);
      setError(code === "too_large" ? t("photoTooLarge") : code === "unsupported" ? t("photoUnsupported") : error instanceof Error && error.message ? error.message : t("photoError"));
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);

    const cleanCedula = cedula.replace(/\D/g, "");
    const cleanPhone = phone.replace(/\D/g, "");
    const cleanName = limitText(fullName.trim(), NAME_MAX_LENGTH);
    if (!cleanName) return setError(t("errName"));
    if (cleanPhone.length < 8) return setError(t("errPhone"));
    if (cleanCedula.length < 9) return setError(t("errCedula"));

    setSaving(true);
    const supabase = createClient();
    const { error: upErr } = await supabase
      .from("profiles")
      .update({ full_name: cleanName, phone: cleanPhone, cedula: cleanCedula })
      .eq("id", user.id);

    if (upErr) {
      setSaving(false);
      setError(upErr.code === "23505" ? t("errDupCedula") : t("errSave"));
      return;
    }

    await supabase.auth.updateUser({
      data: { full_name: cleanName, profile_completed: true },
    });

    const dest = next.startsWith("/") ? next.replace(/^\/[a-z]{2}(?=\/)/, "") : `/${next}`;
    router.push(dest);
  }

  if (authLoading || !user || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
      </div>
    );
  }

  const inputClass =
    "w-full h-11 rounded-xl border border-[#e5e7eb] bg-white pl-10 pr-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex justify-center">
        <ContrataCRLogo />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-8">
          <h1 className="text-2xl font-bold text-[#111827] mb-1">{t("title")}</h1>
          <p className="text-sm text-[#6b7280] mb-6">
            {t("subtitle")}
          </p>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Optional profile photo */}
            <div className="flex items-center gap-4">
              <div
                className="relative h-16 w-16 rounded-full cursor-pointer group shrink-0"
                onClick={() => photoInputRef.current?.click()}
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={t("photoLabel")} className="h-16 w-16 rounded-full object-cover border-2 border-[#e5e7eb]" />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-[#EBF5FB] border-2 border-dashed border-[#bfdbfe] flex items-center justify-center">
                    <Camera className="h-6 w-6 text-[#009FD9]" />
                  </div>
                )}
                {photoUploading && (
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                    <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-[#374151]">{t("photoLabel")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span></p>
                <p className="text-xs text-[#9ca3af]">{t("photoHelp")}</p>
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept={IMAGE_ACCEPT}
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoSelect(f); e.target.value = ""; }}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#374151] block mb-1.5">{t("fullName")} <span className="text-red-500">*</span></label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                <input
                  type="text"
                  value={fullName}
                  maxLength={NAME_MAX_LENGTH}
                  onChange={(e) => setFullName(limitText(e.target.value, NAME_MAX_LENGTH))}
                  placeholder={t("namePlaceholder")}
                  className={inputClass}
                />
              </div>
              {nameFromOAuth && (
                <p className="text-xs text-[#9ca3af] mt-1">{t("nameOAuthHelp")}</p>
              )}
            </div>

            <PhoneInput label={t("phone")} required value={phone} onChange={setPhone} />

            <CedulaInput
              required
              value={cedula}
              onChange={setCedula}
            />

            <button
              type="submit"
              disabled={saving}
              className="mt-2 w-full h-11 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving && <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
              {saving ? t("saving") : t("saveContinue")}
            </button>
          </form>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
