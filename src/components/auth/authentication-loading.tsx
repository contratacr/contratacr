"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";

/** Authentication waits share MFA's full-screen surface, without a fake navbar. */
export function AuthenticationLoading() {
  const t = useTranslations("sessionRecovery");
  return <main data-session-security-loading data-authentication-screen="true" className="ccr-authentication-screen" aria-busy="true" role="status">
    <div className="my-auto w-full max-w-sm shrink-0 bg-white py-8 text-center">
      <div className="mb-7 flex justify-center"><ContrataCRLogo /></div>
      <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#009FD9]" aria-hidden />
      <span className="sr-only">{t("checking")}</span>
    </div>
  </main>;
}
