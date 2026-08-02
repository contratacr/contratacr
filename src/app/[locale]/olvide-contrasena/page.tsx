"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, AlertCircle, MailCheck, RefreshCw } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LandingFooter } from "@/components/landing/landing-footer";
import { SpamNotice } from "@/components/ui/spam-notice";
import { useResendCooldown } from "@/hooks/use-resend-cooldown";

type FormData = {
  email: string;
};

export default function OlvideContrasenaPage() {
  const locale = useLocale();
  const t = useTranslations("forgotPassword");
  const tc = useTranslations("common");
  const schema = z.object({
    email: z.string().email(locale === "en" ? "Invalid email" : "Email invalido"),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const resendState = useResendCooldown();

  useEffect(() => {
    if (!success) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [success]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function sendReset(email: string) {
    const res = await fetch("/api/auth/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        redirectTo: `${window.location.origin}/${locale}/reset-password`,
      }),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, error: json?.error as string | undefined };
  }

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    setError(null);
    const reset = await sendReset(data.email);
    setSubmitting(false);
    if (!reset.ok) {
      setError(reset.error === "email_not_confirmed" ? t("emailNotConfirmed") : t("error"));
      return;
    }
    setSentEmail(data.email);
    setSuccess(true);
    resendState.armCooldown();
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <Navbar />
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-[#e5e7eb] bg-white p-8 shadow-sm">
          <div className="text-center mb-7">
            <h1 className="text-2xl font-bold text-[#111827]">{t("title")}</h1>
            <p className="text-[#6b7280] text-sm mt-1">{t("subtitle")}</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 mb-4">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {success ? (
            <section className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f6fc] text-[#009FD9]">
                <MailCheck className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-xl font-bold text-[#111827]">{t("sentTitle")}</h2>
              <p className="mt-2 text-sm leading-6 text-[#4b5563]">{t("sentBody")}</p>
              {sentEmail && (
                <p className="mx-auto mt-3 max-w-full truncate rounded-full bg-[#f4f7fa] px-3 py-2 text-sm font-semibold text-[#1a2744]">
                  {sentEmail}
                </p>
              )}
              <SpamNotice className="mx-auto mt-3 max-w-[280px] leading-5 text-[#6b7280]" />

              <div className="mt-5 border-t border-[#edf2f7] pt-4">
                {resendState.resent && (
                  <p className="mb-2 text-xs font-semibold text-[#0089bb]">{tc("resent")}</p>
                )}
                <p className="text-sm font-medium text-[#374151]">{tc("resendPrompt")}</p>
                <button
                  type="button"
                  onClick={() => resendState.resend(async () => {
                    await sendReset(sentEmail);
                  })}
                  disabled={resendState.cooldown > 0 || resendState.resending}
                  className="mx-auto mt-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-[#009FD9] transition-colors hover:bg-[#e8f6fc] disabled:text-[#9ca3af] disabled:hover:bg-transparent disabled:cursor-not-allowed"
                >
                  {resendState.resending && <RefreshCw className="h-4 w-4 animate-spin" />}
                  {resendState.cooldown > 0 ? tc("resendIn", { seconds: resendState.cooldown }) : resendState.resending ? tc("resending") : tc("resend")}
                </button>
              </div>
            </section>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <Input
                label={t("emailLabel")}
                type="email"
                placeholder={t("emailPlaceholder")}
                error={errors.email?.message}
                {...register("email")}
              />
              <Button type="submit" size="lg" loading={submitting} className="mt-2">
                {submitting ? t("sending") : (
                  <>
                    {t("sendLink")} <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          )}

          <p className="text-center text-sm text-[#6b7280] mt-6">
            <Link href="/login" className="text-[#009FD9] font-medium hover:underline">
              {t("backToLogin")}
            </Link>
          </p>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
