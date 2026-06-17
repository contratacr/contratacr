"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { useAuth } from "@/hooks/use-auth";
import { Headset, Home } from "lucide-react";
import { SuccessIcon } from "@/components/ui/success-icon";
import { Link } from "@/i18n/navigation";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { SUPPORT_WHATSAPP_URL } from "@/lib/constants";
import { SupportForm } from "@/components/support/support-form";
import { SpamNotice } from "@/components/ui/spam-notice";

export default function SoportePage() {
  const t = useTranslations("soporte");
  const { user } = useAuth();

  const [success, setSuccess] = useState(false);
  const [successEmail, setSuccessEmail] = useState("");

  if (success) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <LandingNavbar />
        <main className="flex-1 flex items-center justify-center px-4 py-20">
          <div className="text-center max-w-md">
            <SuccessIcon size={80} className="mx-auto mb-5" />
            <h1 className="text-2xl font-bold text-[#111827] mb-2">{t("successTitle")}</h1>
            {user ? (
              <>
                <p className="text-[#6b7280] mb-2">
                  {t("successUserDesc")}
                </p>
                <SpamNotice className="mb-6" />
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link
                    href="/dashboard/cliente?tab=soporte"
                    className="inline-flex items-center justify-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold px-6 py-3 rounded-full transition-all text-sm"
                  >
                    <Headset className="h-4 w-4" /> {t("viewTickets")}
                  </Link>
                  <Link
                    href="/dashboard/cliente"
                    className="inline-flex items-center justify-center gap-2 bg-white border border-[#e5e7eb] text-[#374151] font-bold px-6 py-3 rounded-full transition-all text-sm hover:bg-gray-50"
                  >
                    {t("goPanel")}
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="text-[#6b7280] mb-2">
                  {t("successGuestDesc", { email: successEmail })}
                </p>
                <SpamNotice className="mb-3" />
                <p className="text-sm text-[#6b7280] mb-6">
                  {t("guestFollow")}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  {/* Primary: leave / continue (so the user is never stranded). */}
                  <Link
                    href="/"
                    className="inline-flex items-center justify-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold px-6 py-3 rounded-full transition-all text-sm"
                  >
                    <Home className="h-4 w-4" /> {t("backHome")}
                  </Link>
                  {/* Secondary: follow tickets — sign in OR create an account (the /login
                      page offers both). */}
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center gap-2 bg-white border border-[#e5e7eb] text-[#374151] font-bold px-6 py-3 rounded-full transition-all text-sm hover:bg-gray-50"
                  >
                    {t("guestSignInOrRegister")}
                  </Link>
                </div>
              </>
            )}
          </div>
        </main>
        <LandingFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      <LandingNavbar />
      <main className="flex-1 py-16 px-4">
        <div className="mx-auto max-w-xl">

          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EBF5FB] mx-auto mb-3">
              <Headset className="h-6 w-6 text-[#009FD9]" />
            </div>
            <h1 className="text-2xl font-bold text-[#111827] mb-1">{t("headerTitle")}</h1>
            <p className="text-sm text-[#6b7280]">{t("headerSubtitle")}</p>
          </div>

          {/* Primary: support ticket form (shared SupportForm component) */}
          <div className="bg-white rounded-3xl border border-[#e5e7eb] shadow-sm p-8">
            <SupportForm onSuccess={(email) => { setSuccessEmail(email); setSuccess(true); }} />
          </div>

          {/* Secondary, discreet: WhatsApp Business */}
          <p className="mt-5 text-center text-sm text-[#9ca3af]">
            {t("whatsappPre")}{" "}
            <a
              href={SUPPORT_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[#1ebe5d] hover:underline"
            >
              <WhatsAppIcon className="h-4 w-4" /> {t("whatsappLink")}
            </a>
          </p>

        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
