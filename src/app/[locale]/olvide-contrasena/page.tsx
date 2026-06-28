"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";
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

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function sendReset(email: string) {
    const supabase = createClient();
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/${locale}/reset-password`,
    });
  }

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    setError(null);
    const { error: resetError } = await sendReset(data.email);
    setSubmitting(false);
    if (resetError) {
      setError(t("error"));
      return;
    }
    setSentEmail(data.email);
    setSuccess(true);
    resendState.armCooldown();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center py-10 px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <ContrataCRLogo className="justify-center mb-4" />
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
            <div className="flex items-start gap-3 p-4 bg-[#EBF5FB] border border-[#bfdbfe] rounded-xl text-sm text-[#0089bb]">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-[#009FD9]" />
              <div className="min-w-0">
                <p className="font-semibold text-[#1a2744]">{t("sentTitle")}</p>
                <p className="mt-0.5 text-[#374151]">{t("sentBody")}</p>
                <SpamNotice className="mt-1.5" />
                <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[#6b7280]">
                  {resendState.resent && <span className="font-medium text-[#0089bb]">{tc("resent")}</span>}
                  <span>{tc("resendPrompt")}</span>
                  <button
                    type="button"
                    onClick={() => resendState.resend(async () => {
                      await sendReset(sentEmail);
                    })}
                    disabled={resendState.cooldown > 0 || resendState.resending}
                    className="font-semibold text-[#009FD9] hover:underline disabled:text-[#9ca3af] disabled:no-underline disabled:cursor-not-allowed"
                  >
                    {resendState.cooldown > 0 ? tc("resendIn", { seconds: resendState.cooldown }) : resendState.resending ? tc("resending") : tc("resend")}
                  </button>
                </div>
              </div>
            </div>
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
      </main>
      <LandingFooter />
    </div>
  );
}
