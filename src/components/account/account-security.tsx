"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Mail, Lock, ShieldCheck, Eye, EyeOff, Info, ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useResendCooldown } from "@/hooks/use-resend-cooldown";
import { Button } from "@/components/ui/button";
import { SpamNotice } from "@/components/ui/spam-notice";

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
    <div>
      <div className="flex items-start gap-2.5">
        <Info className="h-4 w-4 text-[#9ca3af] shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#111827]">{title}</p>
          <p className="text-xs leading-relaxed text-[#6b7280] mt-1 break-words">{intro}</p>
          {steps && steps.length > 0 && (
            <ol className="mt-2.5 space-y-2">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e5e7eb] text-[10px] font-bold text-[#6b7280]">{i + 1}</span>
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
  const tc = useTranslations("common");

  // Email change
  const [emailMode, setEmailMode] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailApplied, setEmailApplied] = useState(false);
  const [emailPending, setEmailPending] = useState(false);
  const emailResend = useResendCooldown();
  const pwResend = useResendCooldown();

  // After the user confirms the change from the email link, the confirmation URL
  // returns here (via emailRedirectTo → /auth/callback → this account tab) with
  // ?emailChanged=1. The session has been refreshed (so `user.email` is the new
  // address), so we just show an "applied" banner and strip the param.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("emailChanged") === "1") {
      window.setTimeout(() => setEmailApplied(true), 0);
      window.setTimeout(() => {
        setEmailSent(false);
        setEmailPending(false);
      }, 0);
      // Pull the NEW email into the client session immediately so the UI reflects it
      // without a sign-out/in (refresh fires onAuthStateChange → useAuth re-renders).
      createClient().auth.refreshSession().catch(() => {});
      params.delete("emailChanged");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    }
    if (params.get("emailChangePending") === "1") {
      window.setTimeout(() => setEmailPending(true), 0);
      window.setTimeout(() => setEmailSent(false), 0);
      params.delete("emailChangePending");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    }
  }, []);

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
  // One email = one method: an account that HAS an email/password identity is a
  // MANUAL account, so we show the email/password controls even if a stray social
  // identity is also present (we block mixing at sign-in, but if a legacy account
  // ended up with both, the password is what works — keep the UI truthful).
  const oauthProvider = user?.app_metadata?.provider as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasPasswordIdentity = (user?.identities ?? []).some((id: any) => id.provider === "email");
  const isOAuthAccount =
    !hasPasswordIdentity &&
    (oauthProvider === "google" ||
      oauthProvider === "facebook" ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (user?.identities ?? []).some((id: any) => id.provider && id.provider !== "email"));
  const providerLabel = oauthProvider === "facebook" ? "Facebook" : "Google";
  const providerLinks = PROVIDER_LINKS[providerLabel];

  // The actual send (used by the initial submit AND the resend). The confirmation
  // link is built by the **change-email.html** template as
  // `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change` —
  // the **token_hash** flow `/auth/callback` finalizes with `verifyOtp` (no PKCE
  // code_verifier, so it survives email-scanner prefetch / a different device, and
  // needs no redirect_to allowlist). The static template can't know the app locale,
  // so we stash it in `user_metadata.email_change_locale`; the callback reads it to
  // land the user on **/{locale}/dashboard/{panel}?tab=cuenta&emailChanged=1** (the
  // success flag triggers `refreshSession()` below). `emailRedirectTo` is kept only
  // as a harmless fallback (the template's self-built link is what's actually used).
  async function performEmailChange(): Promise<string | null> {
    const supabase = createClient();
    const role = (user?.user_metadata?.role as string | undefined) === "professional" ? "profesional" : "cliente";
    const next = `/${locale}/dashboard/${role}?tab=cuenta&emailChanged=1`;
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.updateUser(
      {
        email: newEmail.trim(),
        data: {
          email_change_locale: locale,
          email_change_pending_to: newEmail.trim().toLowerCase(),
        },
      },
      { emailRedirectTo }
    );
    return error?.message ?? null;
  }

  async function sendEmailChange() {
    if (!newEmail.trim()) return;
    setEmailError(null);
    const err = await performEmailChange();
    if (err) {
      // Supabase returns these in English — show a localized message instead.
      const taken = /already|registered|exists|in use|taken|duplicate/i.test(err);
      setEmailError(taken ? t("emailTaken") : t("emailChangeError"));
      return;
    }
    setEmailSent(true);
    setEmailPending(false);
    setEmailMode(false);
    emailResend.armCooldown();
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

  // The actual send (reused by the initial submit AND the resend).
  async function performReset() {
    if (!user?.email) return;
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/${locale}/reset-password`,
    });
  }

  async function sendReset() {
    if (!user?.email) return;
    setResetBusy(true);
    await performReset();
    setResetBusy(false);
    setResetSent(true);
    pwResend.armCooldown();
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
        {emailApplied && (
          <div className="mb-3 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-800">{t("emailAppliedTitle")}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-emerald-700">{t("emailAppliedBody")}</p>
            </div>
          </div>
        )}
        {emailPending && (
          <div className="mb-3 flex items-start gap-3 rounded-2xl border border-[#b8e4f5] bg-[#f8fbfe] px-4 py-3">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#009FD9]" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#162543]">{t("emailPendingTitle")}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-[#4b6270]">{t("emailPendingBody")}</p>
            </div>
          </div>
        )}
        {emailPending && (
          <div className="mb-3 rounded-xl bg-[#EBF5FB] border border-[#b8e4f5] px-4 py-3 text-sm text-[#16617a]">
            {t("emailPending")}
          </div>
        )}
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
          <div className="rounded-2xl border border-[#b8e4f5] bg-[#f8fbfe] px-4 py-3">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#009FD9]" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#162543]">{t("emailSentTitle")}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#4b6270]">{t("emailSentBody")}</p>
                <SpamNotice className="mt-1.5 text-[#6b7280]" />
              </div>
            </div>
            {/* Resend (brief cooldown so it can't be spammed) */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl bg-white/80 px-3 py-2 text-xs text-[#4b6270] ring-1 ring-[#d8eef8]">
              {emailResend.resent && <span className="font-semibold">{tc("resent")}</span>}
              <span>{tc("resendPrompt")}</span>
              <button
                type="button"
                onClick={() => emailResend.resend(async () => { await performEmailChange(); })}
                disabled={emailResend.cooldown > 0 || emailResend.resending}
                className="font-semibold text-[#009FD9] hover:underline disabled:text-[#9ca3af] disabled:no-underline disabled:cursor-not-allowed"
              >
                {emailResend.cooldown > 0 ? tc("resendIn", { seconds: emailResend.cooldown }) : emailResend.resending ? tc("resending") : tc("resend")}
              </button>
            </div>
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
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <span className="min-w-0 break-all text-sm font-medium text-[#111827] sm:break-normal sm:truncate">{user?.email}</span>
            <button onClick={() => setEmailMode(true)} className="self-start whitespace-nowrap text-sm font-semibold text-[#009FD9] hover:underline sm:self-auto">
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
              {newPw && (
                <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#111827] hover:text-[#374151]">
                  {showPw ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                </button>
              )}
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
              <div>
                <p className="text-xs text-emerald-600">{t("resetSent", { email: user?.email ?? "" })}</p>
                <SpamNotice className="mt-1" />
                {/* Resend (brief cooldown so it can't be spammed) */}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6b7280]">
                  {pwResend.resent && <span className="font-semibold text-emerald-600">{tc("resent")}</span>}
                  <span>{tc("resendPrompt")}</span>
                  <button
                    type="button"
                    onClick={() => pwResend.resend(performReset)}
                    disabled={pwResend.cooldown > 0 || pwResend.resending}
                    className="font-semibold text-[#009FD9] hover:underline disabled:text-[#9ca3af] disabled:no-underline disabled:cursor-not-allowed"
                  >
                    {pwResend.cooldown > 0 ? tc("resendIn", { seconds: pwResend.cooldown }) : pwResend.resending ? tc("resending") : tc("resend")}
                  </button>
                </div>
              </div>
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
