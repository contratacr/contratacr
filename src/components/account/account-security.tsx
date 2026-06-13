"use client";

import { useState } from "react";
import { Mail, Lock, ShieldCheck, Eye, EyeOff, Info, ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

/* Where each provider lets the user manage their account/email + sign-in security.
   Shown to OAuth users instead of fields that wouldn't work here. */
const PROVIDER_LINKS: Record<string, { account: string; security: string }> = {
  Google: { account: "https://myaccount.google.com/email", security: "https://myaccount.google.com/security" },
  Facebook: { account: "https://accounts.facebook.com/", security: "https://www.facebook.com/settings?tab=security" },
};

/* Reusable info-style guidance block for OAuth users (not an error look). Clean
   heading, optional ordered steps, and a link out to the provider. Responsive:
   wraps cleanly down to ~360px. */
function OAuthGuide({
  title, intro, steps, linkLabel, linkHref,
}: {
  title: string;
  intro: string;
  steps?: string[];
  linkLabel: string;
  linkHref: string;
}) {
  return (
    // Neutral info block (no blue-on-blue, no border-in-card): dark readable text
    // on a soft grey tint; the ONLY accent is the brand-blue link (an action).
    <div className="rounded-xl bg-[#f9fafb] p-4">
      <div className="flex items-start gap-2.5">
        <Info className="h-4 w-4 text-[#6b7280] shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#111827]">{title}</p>
          <p className="text-xs leading-relaxed text-[#6b7280] mt-1 break-words">{intro}</p>
          {steps && steps.length > 0 && (
            <ol className="mt-2.5 space-y-2">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e5e7eb] text-[10px] font-bold text-[#374151]">{i + 1}</span>
                  <span className="text-xs leading-relaxed text-[#374151] break-words">{s}</span>
                </li>
              ))}
            </ol>
          )}
          <a
            href={linkHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#009FD9] hover:underline break-words"
          >
            {linkLabel} <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * "Cuenta y seguridad" — manage how you log in: change email + password.
 *
 * OAUTH-AWARE: accounts created with Google/Facebook have no ContrataCR
 * password and their email is managed by the provider — for them we show a
 * clear note instead of fields that wouldn't work. Email/password accounts get
 * the full change-email + change-password flows (Supabase Auth, with
 * confirmation + friendly feedback).
 */
const inputClass =
  "w-full h-10 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

export function AccountSecuritySection({ showHeading = true }: { showHeading?: boolean }) {
  const { user } = useAuth();
  const locale = useLocale();
  const t = useTranslations("accountSecurity");

  // Email change
  const [emailMode, setEmailMode] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Password change
  const [pwMode, setPwMode] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  // Forgot-password escape hatch (sends the reset email).
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Detect OAuth (Google/Facebook) accounts — no password, provider-managed email.
  const oauthProvider = user?.app_metadata?.provider as string | undefined;
  const isOAuthAccount =
    oauthProvider === "google" ||
    oauthProvider === "facebook" ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user?.identities ?? []).some((id: any) => id.provider && id.provider !== "email");
  const providerLabel = oauthProvider === "facebook" ? "Facebook" : "Google";
  const providerLinks = PROVIDER_LINKS[providerLabel];

  async function sendEmailChange() {
    if (!newEmail.trim()) return;
    setEmailError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) { setEmailError(error.message); return; }
    setEmailSent(true);
    setEmailMode(false);
  }

  async function savePassword() {
    setPwError(null);
    if (!currentPw) { setPwError(t("errCurrentPassword")); return; }
    if (newPw.length < 8) { setPwError(t("errNewLength")); return; }
    if (newPw !== confirmPw) { setPwError(t("errMismatch")); return; }
    if (!user?.email) { setPwError(t("errValidate")); return; }
    setPwSaving(true);
    const supabase = createClient();
    // Verify the CURRENT password by re-authenticating — Supabase validates the
    // hash for us (we never read/decrypt it). Same session, no emailed code.
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPw });
    if (signInErr) { setPwSaving(false); setPwError(t("errWrongPassword")); return; }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwSaving(false);
    if (error) { setPwError(error.message); return; }
    setPwSaved(true);
    setPwMode(false);
    setCurrentPw(""); setNewPw(""); setConfirmPw("");
    setTimeout(() => setPwSaved(false), 4000);
  }

  async function sendReset() {
    if (!user?.email) return;
    setResetBusy(true);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/${locale}/reset-password`,
    });
    setResetBusy(false);
    setResetSent(true);
  }

  return (
    <div className="space-y-4">
      {showHeading && (
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[#009FD9]" />
          <h2 className="text-lg font-semibold text-[#111827]">{t("heading")}</h2>
        </div>
      )}

      {/* Email */}
      <div className="bg-white rounded-2xl border border-[#e5e7eb] p-5">
        <div className="flex items-center gap-2 mb-2">
          <Mail className="h-4 w-4 text-[#6b7280]" />
          <h3 className="text-sm font-semibold text-[#374151]">{t("email")}</h3>
        </div>
        {isOAuthAccount ? (
          <div className="flex flex-col gap-3">
            <span className="text-sm text-[#111827] font-medium break-words">{user?.email}</span>
            <OAuthGuide
              title={t("emailProviderTitle", { provider: providerLabel })}
              intro={t("emailProviderIntro", { provider: providerLabel })}
              steps={[
                t("emailStep1", { provider: providerLabel }),
                t("emailStep2"),
              ]}
              linkLabel={t("manageAccount", { provider: providerLabel })}
              linkHref={providerLinks.account}
            />
          </div>
        ) : emailSent ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
            {t("emailSent")}
          </div>
        ) : emailMode ? (
          <div className="flex flex-col gap-3">
            <input
              type="email"
              className={inputClass}
              placeholder={t("newEmailPlaceholder")}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            {emailError && <p className="text-xs text-red-500">{emailError}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={sendEmailChange} disabled={!newEmail.trim()}>{t("sendConfirmation")}</Button>
              <Button size="sm" variant="outline" onClick={() => { setEmailMode(false); setNewEmail(""); setEmailError(null); }}>{t("cancel")}</Button>
            </div>
            <p className="text-xs text-[#9ca3af]">{t("emailConfirmHelp")}</p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-[#111827] font-medium">{user?.email}</span>
            <button onClick={() => setEmailMode(true)} className="text-sm text-[#009FD9] hover:underline whitespace-nowrap">
              {t("changeEmail")}
            </button>
          </div>
        )}
      </div>

      {/* Password */}
      <div className="bg-white rounded-2xl border border-[#e5e7eb] p-5">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="h-4 w-4 text-[#6b7280]" />
          <h3 className="text-sm font-semibold text-[#374151]">{t("password")}</h3>
        </div>
        {isOAuthAccount ? (
          <OAuthGuide
            title={t("passwordProviderTitle", { provider: providerLabel })}
            intro={t("passwordProviderIntro", { provider: providerLabel })}
            linkLabel={t("manageSecurity", { provider: providerLabel })}
            linkHref={providerLinks.security}
          />
        ) : pwSaved ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
            {t("passwordUpdated")}
          </div>
        ) : pwMode ? (
          <div className="flex flex-col gap-3">
            <input
              type={showPw ? "text" : "password"}
              className={inputClass}
              placeholder={t("currentPassword")}
              autoComplete="current-password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
            />
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                className={inputClass}
                placeholder={t("newPassword")}
                autoComplete="new-password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
              />
              <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <input
              type={showPw ? "text" : "password"}
              className={inputClass}
              placeholder={t("repeatPassword")}
              autoComplete="new-password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
            />
            {pwError && <p className="text-xs text-red-500">{pwError}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={savePassword} loading={pwSaving} disabled={pwSaving || !currentPw || !newPw || !confirmPw}>{t("savePassword")}</Button>
              <Button size="sm" variant="outline" onClick={() => { setPwMode(false); setCurrentPw(""); setNewPw(""); setConfirmPw(""); setPwError(null); }}>{t("cancel")}</Button>
            </div>
            {/* Forgot-password escape hatch — sends the reset email. */}
            {resetSent ? (
              <p className="text-xs text-emerald-600">{t("resetSent", { email: user?.email ?? "" })}</p>
            ) : (
              <button type="button" onClick={sendReset} disabled={resetBusy} className="self-start text-xs text-[#009FD9] hover:underline disabled:opacity-60">
                {resetBusy ? t("sending") : t("forgotPassword")}
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-[#9ca3af]">••••••••</span>
            <button onClick={() => setPwMode(true)} className="text-sm text-[#009FD9] hover:underline whitespace-nowrap">
              {t("changePassword")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
