"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/layout/navbar";
import { FocusedHeader } from "@/components/layout/focused-header";
import { Button } from "@/components/ui/button";
import { PhoneInput, isPhoneComplete } from "@/components/ui/phone-input";
import { OtpVerification } from "@/components/auth/otp-verification";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CheckCircle2, Eye, EyeOff, User } from "lucide-react";
import { SuccessIcon } from "@/components/ui/success-icon";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils";
import { detectSocialOnly, providerLabel } from "@/lib/auth-method";
import { useRedirectIfRegistered } from "@/hooks/use-redirect-if-registered";
import { NAME_MAX_LENGTH, limitText } from "@/lib/text-limits";
import { applyPendingFollow, hasPendingFollow } from "@/components/professionals/follow-button";

export default function RegisterClientPage() {
  const router = useRouter();
  const t = useTranslations("registerClient");
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  // An already-registered, logged-in user must never be pushed through account
  // creation — bounce them to their panel. Logged-out visitors (new email/password
  // signup) and incomplete OAuth sessions completing their profile are left alone.
  const { checking } = useRedirectIfRegistered();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  const [oauthPhoto, setOauthPhoto] = useState<string | null>(null);
  const panelHref = searchParams.get("redirect") || (hasPendingFollow() ? "/dashboard/profesional?tab=network&mode=use" : "/dashboard/profesional?mode=use");

  async function completeSuccess() {
    const { data } = await createClient().auth.getUser();
    if (data.user?.id) await applyPendingFollow(data.user.id);
    setOtpEmail(null);
    setSuccess(true);
  }

  // Pre-fill from OAuth user
  useEffect(() => {
    if (authLoading) return;
    if (user) {
      const name = (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || "";
      const photo = (user.user_metadata?.avatar_url as string) || (user.user_metadata?.picture as string) || null;
      setFullName(limitText(name, NAME_MAX_LENGTH));
      setEmail(user.email ?? "");
      setOauthPhoto(photo);
    }
  }, [user, authLoading]);

  // "Already registered" message — specific when the existing account is social-only
  // (so we say "regístrate/entra con Google" instead of suggesting a password).
  async function alreadyRegisteredMsg(addr: string): Promise<string> {
    const provider = await detectSocialOnly(addr);
    return provider ? t("errSocialAccount", { provider: providerLabel(provider) }) : t("errAlreadyRegistered");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPhoneError(null);

    const cleanName = limitText(fullName.trim(), NAME_MAX_LENGTH);
    if (!cleanName) { setError(t("errName")); return; }
    if (!user && !email.trim()) { setError(t("errEmail")); return; }
    if (!user && password.length < 8) { setError(t("errPasswordLen")); return; }
    if (!user && password !== confirmPassword) { setError(t("errPasswordMismatch")); return; }

    // The account holder's phone is REQUIRED — client↔professional coordination
    // happens by WhatsApp/call, so without it they can't reach each other.
    if (!isPhoneComplete(phone)) {
      setPhoneError(t("errPhone"));
      return;
    }

    // NOTE: clients do NOT provide a cédula at signup — it's only collected later
    // when they REQUEST A SERVICE (booking flow / completar-perfil). Keeping it out
    // of registration reduces friction. (Pros still provide a cédula for verification.)

    setSubmitting(true);

    try {
      let userId: string | undefined;

      if (!user) {
        // New email/password signup
        const supabase = createClient();
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // onboarding_completed lets middleware send them straight to their
            // panel after verifying — never back to the role-selection screen.
            data: { role: "client", full_name: cleanName, onboarding_completed: true },
          },
        });

        if (signUpError) {
          if (signUpError.message.toLowerCase().includes("already registered")) {
            setError(await alreadyRegisteredMsg(email));
          } else {
            setError(signUpError.message);
          }
          setSubmitting(false);
          return;
        }

        // Supabase anti-enumeration: existing email → user with empty identities.
        if (Array.isArray(data.user?.identities) && data.user!.identities!.length === 0) {
          setError(await alreadyRegisteredMsg(email));
          setSubmitting(false);
          return;
        }

        userId = data.user?.id;
      } else {
        userId = user.id;
      }

      // Upsert profile via API
      const res = await fetch("/api/register/client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          fullName: cleanName,
          phone: phone.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("errCreate"));
        setSubmitting(false);
        return;
      }

      // New email/password accounts must verify their email via OTP before the
      // account is considered complete. OAuth users are already verified.
      if (!user) {
        setOtpEmail(email);
      } else {
        await applyPendingFollow(user.id);
        setSuccess(true);
      }
    } catch {
      setError(t("errUnexpected"));
    } finally {
      setSubmitting(false);
    }
  }

  // While we determine whether this is an existing account, show a loader — never
  // the registration form — so an already-logged-in user never sees the "create
  // account" flash before being redirected to their panel.
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
      </div>
    );
  }

  if (otpEmail) {
    return (
      <div className="min-h-screen flex flex-col bg-[#fafafa]">
        {user ? <FocusedHeader /> : <Navbar mobileSearch={false} />}
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-sm">
            <div className="bg-white rounded-3xl shadow-sm border border-[#e5e7eb] p-8">
              <OtpVerification email={otpEmail} onVerified={() => { void completeSuccess(); }} />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col bg-[#fafafa]">
        {user ? <FocusedHeader /> : <Navbar mobileSearch={false} />}
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md text-center">
            <SuccessIcon size={80} className="mx-auto mb-5" />
            <h1 className="text-2xl font-bold text-[#111827] mb-2">{t("successTitle")}</h1>
            <p className="text-[#6b7280] mb-8">
              {t("successBody")}
            </p>
            <Button size="lg" className="w-full" onClick={() => router.push(panelHref)}>
              {t("goToPanel")}
            </Button>
            <Button variant="outline" size="lg" className="w-full mt-3" onClick={() => router.push("/buscar")}>
              {t("searchPros")}
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const inputClass =
    "w-full h-11 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      {user ? <FocusedHeader /> : <Navbar mobileSearch={false} />}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-sm border border-[#e5e7eb] p-8">
            <div className="text-center mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EBF5FB] mx-auto mb-3">
                <User className="h-6 w-6 text-[#009FD9]" />
              </div>
              <h1 className="text-2xl font-bold text-[#111827]">{t("title")}</h1>
              <p className="text-sm text-[#6b7280] mt-1">{t("subtitle")}</p>
            </div>

            {/* OAuth banner */}
            {user && (
              <div className="flex items-center gap-3 bg-[#EBF5FB] border border-[#bfdbfe] rounded-xl px-4 py-3 mb-5">
                {oauthPhoto ? (
                  <img src={oauthPhoto} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
                ) : (
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-[#009FD9] text-white text-sm font-semibold">
                      {getInitials(fullName)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#009FD9] font-semibold">{t("identityConfirmed")}</p>
                  <p className="text-sm font-bold text-[#111827] truncate">{fullName || user.email}</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-[#009FD9] shrink-0" />
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Full name — clients sign up with just their name (no cédula; that's
                  collected later when they request a service). Pre-filled for OAuth. */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">{t("fullName")} <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder={t("namePlaceholder")}
                  value={fullName}
                  maxLength={NAME_MAX_LENGTH}
                  onChange={(e) => setFullName(limitText(e.target.value, NAME_MAX_LENGTH))}
                  required
                />
              </div>

              {!user && (
                <>
                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">{t("email")} <span className="text-red-500">*</span></label>
                    <input
                      type="email"
                      className={inputClass}
                      placeholder={t("emailPlaceholder")}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">{t("password")} <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        className={cn(inputClass, "pr-11")}
                        placeholder={t("passwordPlaceholder")}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                      />
                      {password && (
                        <button
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#111827] hover:text-[#374151] transition-colors"
                        >
                          {showPassword ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">{t("confirmPassword")} <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input
                        type={showConfirm ? "text" : "password"}
                        className={cn(inputClass, "pr-11", confirmPassword && password !== confirmPassword && "border-red-400 focus:ring-red-400")}
                        placeholder={t("confirmPlaceholder")}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={8}
                      />
                      {confirmPassword && (
                        <button
                          type="button"
                          onClick={() => setShowConfirm((s) => !s)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#111827] hover:text-[#374151] transition-colors"
                        >
                          {showConfirm ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                        </button>
                      )}
                    </div>
                    {confirmPassword && password !== confirmPassword && (
                      <p className="text-xs text-red-500 mt-1">{t("errPasswordMismatch")}</p>
                    )}
                  </div>
                </>
              )}

              {/* NOTE: clients do NOT set a provincia/cantón at signup — they indicate
                  their location when SEARCHING or REQUESTING A SERVICE, where it's actually
                  used. Keeping it out of registration reduces friction. */}

              <PhoneInput
                label={t("phone")}
                required
                value={phone}
                onChange={(v) => { setPhone(v); setPhoneError(null); }}
                error={phoneError ?? undefined}
              />

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button type="submit" size="lg" className="w-full mt-1" loading={submitting} disabled={submitting}>
                {submitting ? t("creating") : user ? t("saveContinue") : t("createFree")}
              </Button>
              {!user && (
                <p className="text-center text-xs leading-relaxed text-[#8a9aab]">
                  Al crear una cuenta, aceptas los <Link href="/terminos" className="font-semibold text-[#009FD9]">Términos</Link> y la <Link href="/privacidad" className="font-semibold text-[#009FD9]">Política de Privacidad</Link> de ContrataCR.
                </p>
              )}

              <p className="sr-only">
                {t.rich("terms", {
                  terms: (c) => <a href="/terminos" className="underline hover:text-[#374151]">{c}</a>,
                  privacy: (c) => <a href="/privacidad" className="underline hover:text-[#374151]">{c}</a>,
                })}
              </p>

              <div className="text-center text-sm text-[#6b7280]">
                {t("haveAccount")}{" "}
                <a href="/login" className="text-[#009FD9] font-medium hover:underline">
                  {t("signIn")}
                </a>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
