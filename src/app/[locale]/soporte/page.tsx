"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { SectionHeaderTitle } from "@/components/mobile/section-header-title";
import { LandingFooter } from "@/components/landing/landing-footer";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Headset, Home } from "lucide-react";
import { SuccessIcon } from "@/components/ui/success-icon";
import { Link } from "@/i18n/navigation";
import { SupportForm } from "@/components/support/support-form";
import { SpamNotice } from "@/components/ui/spam-notice";
import { canOffer } from "@/lib/auth/capabilities";

export default function SoportePage() {
  const tSeccion = useTranslations("sectionTitles");
  const t = useTranslations("soporte");
  const { user } = useAuth();
  const panelHref = "/dashboard/profesional?tab=soporte";
  const panelHomeHref = canOffer(user) ? "/dashboard/profesional" : "/dashboard/profesional?mode=use";

  const [success, setSuccess] = useState(false);
  const [successEmail, setSuccessEmail] = useState("");

  useEffect(() => {
    if (!success) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [success]);

  if (success) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <LandingNavbar />
      <SectionHeaderTitle title={tSeccion("support")} fallbackHref="/" />
        <div className="ccr-navbar-spacer h-16" aria-hidden />
        <main className="flex flex-1 items-center justify-center px-4 pb-20 pt-12">
          {/* Confirmation — tight visual hierarchy: prominent title + ONE concise
              reply line (email emphasized), then the actions, then the spam note +
              (guest) follow-tickets hint demoted to small muted footnotes. Avoids the
              old wall of four equal-weight lines. */}
          <div className="text-center max-w-md">
            <SuccessIcon size={80} className="mx-auto mb-5" />
            <h1 className="text-2xl font-bold text-[#111827] mb-2">{t("successTitle")}</h1>

            {/* Primary message (one line) */}
            <p className="text-[#6b7280]">
              {user
                ? t("successUserDesc")
                : t.rich("successGuestDesc", {
                    email: successEmail,
                    b: (c) => <span className="font-semibold text-[#111827]">{c}</span>,
                  })}
            </p>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
              {user ? (
                <>
                  <Link
                    href={panelHref}
                    className="inline-flex items-center justify-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold px-6 py-3 rounded-full transition-all text-sm"
                  >
                    <Headset className="h-4 w-4" /> {t("viewTickets")}
                  </Link>
                  <Link
                    href={panelHomeHref}
                    className="inline-flex items-center justify-center gap-2 bg-white border border-[#e5e7eb] text-[#374151] font-bold px-6 py-3 rounded-full transition-all text-sm hover:bg-gray-50"
                  >
                    {t("goPanel")}
                  </Link>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>

            {/* Secondary, subtle footnotes (spam note + guest follow-tickets hint) */}
            <div className="mt-6 space-y-1">
              <SpamNotice />
              {!user && <p className="text-xs text-[#9ca3af]">{t("guestFollow")}</p>}
            </div>
          </div>
        </main>
        <LandingFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      <LandingNavbar />
      <SectionHeaderTitle title={tSeccion("support")} fallbackHref="/" />
      <div className="ccr-navbar-spacer h-16" aria-hidden />
      <main className="ccr-native-compact-page flex-1 px-4 pb-16 pt-12">
        <div className="mx-auto max-w-xl">
          {user && (
            <div className="mb-5">
              <Link
                href={panelHref}
                className="inline-flex items-center gap-2 rounded-full border border-[#d8eef8] bg-white px-4 py-2 text-sm font-semibold text-[#0089bb] shadow-sm transition-colors hover:bg-[#f5fbfe]"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("backToPanel")}
              </Link>
            </div>
          )}

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

        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
