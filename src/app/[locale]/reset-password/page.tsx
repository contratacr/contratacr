"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Circle, ArrowRight, AlertCircle, Lock } from "lucide-react";
import { SuccessIcon } from "@/components/ui/success-icon";
import { BrandIconBadge } from "@/components/ui/brand-icon-badge";
import { Navbar } from "@/components/layout/navbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

type FormData = { password: string; confirmPassword: string };

function PasswordChecklist({ password }: { password: string }) {
  const t = useTranslations("resetPassword");
  const rules = [
    { label: t("rule8"), ok: password.length >= 8 },
    { label: t("ruleUpper"), ok: /[A-Z]/.test(password) },
    { label: t("ruleLower"), ok: /[a-z]/.test(password) },
    { label: t("ruleNumber"), ok: /[0-9]/.test(password) },
    { label: t("ruleSpecial"), ok: /[!@#$%^&*]/.test(password) },
  ];
  if (!password) return null;
  return (
    <div className="flex flex-col gap-1 mt-1.5">
      {rules.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          {r.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-gray-300 shrink-0" />
          )}
          <span className={`text-xs ${r.ok ? "text-emerald-600" : "text-gray-400"}`}>
            {r.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const t = useTranslations("resetPassword");
  const [submitting, setSubmitting] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [done]);

  // Built inside the component so validation messages localize (and reuse the
  // same rule labels shown in the live checklist).
  const schema = useMemo(
    () =>
      z
        .object({
          password: z
            .string()
            .min(8, t("rule8"))
            .regex(/[A-Z]/, t("ruleUpper"))
            .regex(/[a-z]/, t("ruleLower"))
            .regex(/[0-9]/, t("ruleNumber"))
            .regex(/[!@#$%^&*]/, t("ruleSpecial")),
          confirmPassword: z.string(),
        })
        .refine((d) => d.password === d.confirmPassword, {
          message: t("passwordsDontMatch"),
          path: ["confirmPassword"],
        }),
    [t]
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
    trigger,
    watch,
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const watchedPassword = watch("password") ?? "";
  const watchedConfirmPassword = watch("confirmPassword") ?? "";
  const confirmPasswordFieldError = errors.confirmPassword?.message;
  const confirmPasswordMismatch = watchedConfirmPassword.length > 0 && watchedPassword !== watchedConfirmPassword;
  const confirmPasswordMatches = watchedConfirmPassword.length > 0 && watchedPassword === watchedConfirmPassword;
  const confirmPasswordError = confirmPasswordMismatch
    ? t("passwordsDontMatch")
    : confirmPasswordMatches
      ? undefined
      : confirmPasswordFieldError;

  useEffect(() => {
    if (!watchedConfirmPassword && !confirmPasswordFieldError) return;
    void trigger("confirmPassword");
  }, [confirmPasswordFieldError, trigger, watchedPassword, watchedConfirmPassword]);

  useEffect(() => {
    let active = true;

    async function prepareRecoverySession() {
      const supabase = createClient();
      try {
        const url = new URL(window.location.href);
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const code = url.searchParams.get("code");
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        const urlError = url.searchParams.get("error") || hash.get("error") || url.searchParams.get("error_code") || hash.get("error_code");

        if (urlError) {
          if (active) setError(t("error"));
          return;
        }

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError && active) setError(t("error"));
        } else if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError && active) setError(t("error"));
        } else {
          const { data } = await supabase.auth.getUser();
          if (!data.user && active) setError(t("error"));
        }

        if (code || accessToken || refreshToken || urlError) {
          window.history.replaceState({}, "", window.location.pathname);
        }
      } catch {
        if (active) setError(t("error"));
      } finally {
        if (active) setInitializing(false);
      }
    }

    void prepareRecoverySession();
    return () => { active = false; };
  }, [t]);

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setSubmitting(false);
      setError(t("error"));
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({
      password: data.password,
    });
    if (updateError) {
      setSubmitting(false);
      // Supabase rejects setting the SAME password as before (code "same_password" /
      // "New password should be different from the old password.") — that is NOT an
      // expired link, so show the correct, specific message instead of "enlace expirado".
      const code = (updateError as { code?: string }).code ?? "";
      const msg = (updateError.message ?? "").toLowerCase();
      const samePw = code === "same_password" || msg.includes("should be different") || msg.includes("different from the old");
      setError(samePw ? t("samePassword") : t("error"));
      return;
    }
    // Keep the button in its loading state through the role lookup (don't re-enable it
    // for the async gap), then switch to the success screen.
    // Resolve the destination panel NOW (role-aware) so we land STRAIGHT on the right
    // dashboard. Pushing a hardcoded /dashboard/cliente made a PRO bounce
    // cliente→profesional, flashing the wrong panel for a moment. `replace` (not push)
    // also keeps the reset page out of history.
    let role = (await supabase.auth.getUser()).data.user?.user_metadata?.role as string | undefined;
    if (role !== "professional" && role !== "client") {
      const { data: prof } = await supabase.rpc("get_my_profile");
      const p = prof as { role?: string } | null;
      if (p?.role === "professional" || p?.role === "client") role = p.role;
    }
    const panel = role === "professional" ? "profesional" : "cliente";
    setDone(true);
    setTimeout(() => router.replace(`/dashboard/${panel}`), 1800);
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col bg-[#fafafa]">
        <Navbar />
        <main className="flex-1 flex items-center justify-center py-12 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[#e5e7eb] bg-white p-8 text-center shadow-sm">
            <SuccessIcon size={80} className="mx-auto mb-5" />
            <h1 className="text-2xl font-bold text-[#111827] mb-2">{t("doneTitle")}</h1>
            <p className="text-[#6b7280] text-sm">
              {t("doneBody")}
            </p>
          </div>
        </main>
        <LandingFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <Navbar />
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md rounded-3xl border border-[#e5e7eb] bg-white p-8 shadow-sm">
          <div className="text-center mb-8">
            <BrandIconBadge icon={Lock} size={56} className="mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-[#111827]">{t("title")}</h1>
            <p className="text-[#6b7280] text-sm mt-1">
              {t("subtitle")}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 mb-4">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div>
              <Input
                label={t("newPassword")}
                type="password"
                placeholder="••••••••"
                error={errors.password?.message}
                disabled={initializing || submitting}
                {...register("password")}
              />
              <PasswordChecklist password={watchedPassword} />
            </div>
            <Input
              label={t("confirmPassword")}
              type="password"
              placeholder="••••••••"
              error={confirmPasswordError}
              disabled={initializing || submitting}
              {...register("confirmPassword")}
            />
            <Button type="submit" size="lg" loading={submitting || initializing} disabled={initializing} className="mt-2">
              {initializing ? (
                t("preparing")
              ) : submitting ? (
                t("updating")
              ) : (
                <>
                  {t("updatePassword")} <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-[#6b7280] mt-6">
            <Link href="/login" className="text-[#009FD9] font-medium hover:underline">
              {t("backToLogin")}
            </Link>
          </p>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
