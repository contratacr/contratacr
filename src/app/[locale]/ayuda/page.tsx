"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { Link } from "@/i18n/navigation";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { SUPPORT_WHATSAPP_URL } from "@/lib/constants";
import { ChevronDown, MessageSquare, Search, UserCheck, CalendarDays, Star, ShieldCheck, HelpCircle } from "lucide-react";

const FAQ_ICONS = [
  <HelpCircle key="0" className="h-4 w-4" />, <UserCheck key="1" className="h-4 w-4" />,
  <ShieldCheck key="2" className="h-4 w-4" />, <Search key="3" className="h-4 w-4" />,
  <CalendarDays key="4" className="h-4 w-4" />, <Star key="5" className="h-4 w-4" />,
  <HelpCircle key="6" className="h-4 w-4" />, <UserCheck key="7" className="h-4 w-4" />,
];

function FaqAccordion() {
  const t = useTranslations("ayuda");
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="divide-y divide-gray-100">
      {FAQ_ICONS.map((icon, i) => (
        <div key={i}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between py-5 text-left gap-4 group"
          >
            <div className="flex items-center gap-3 flex-1">
              <span className="text-[#009FD9] shrink-0">{icon}</span>
              <span className="text-base font-semibold text-[#1a2744] group-hover:text-[#009FD9] transition-colors">
                {t(`faq${i}Q`)}
              </span>
            </div>
            <ChevronDown
              className={`h-5 w-5 text-gray-400 shrink-0 transition-transform duration-200 ${open === i ? "rotate-180 text-[#009FD9]" : ""}`}
            />
          </button>
          {open === i && (
            <p className="pb-5 text-sm text-gray-500 leading-relaxed pl-7">{t(`faq${i}A`)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Help Categories (icons + href in code; text from i18n) ── */
const HELP_CATEGORIES = [
  { icon: <UserCheck className="h-6 w-6 text-[#009FD9]" />, href: null },
  { icon: <Search className="h-6 w-6 text-[#009FD9]" />, href: "/buscar" as const },
  { icon: <ShieldCheck className="h-6 w-6 text-[#009FD9]" />, href: null },
  { icon: <CalendarDays className="h-6 w-6 text-[#009FD9]" />, href: "/publicar-proyecto" as const },
  { icon: <Star className="h-6 w-6 text-[#009FD9]" />, href: null },
  { icon: <MessageSquare className="h-6 w-6 text-[#009FD9]" />, href: "/soporte" as const },
];

export default function AyudaPage() {
  const t = useTranslations("ayuda");
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero */}
      <section className="pt-32 pb-14 bg-white text-center px-4">
        <FadeInUp>
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#009FD9] bg-[#EBF5FB] px-4 py-1.5 rounded-full mb-4">
            {t("eyebrow")}
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#1a2744] mb-4 leading-tight">
            {t("title")}
          </h1>
          <p className="text-lg text-gray-500 max-w-lg mx-auto">
            {t("subtitle")}
          </p>
        </FadeInUp>
      </section>

      {/* Category Cards — same max-width as FAQ below */}
      <section className="pb-16 px-4 bg-[#f4f7fa]">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-10">
              {HELP_CATEGORIES.map((cat, i) => {
                const card = (
                  <div className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 h-full">
                    <div className="mb-3">{cat.icon}</div>
                    <h3 className="text-sm font-bold text-[#1a2744] mb-1">{t(`cat${i}Title`)}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">{t(`cat${i}Desc`)}</p>
                  </div>
                );
                return (
                  <FadeInUp key={i} delay={i * 50}>
                    {cat.href ? (
                      <Link href={cat.href} className="block h-full">{card}</Link>
                    ) : (
                      card
                    )}
                  </FadeInUp>
                );
              })}
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* FAQ — same max-width as category cards above */}
      <section className="py-16 px-4 bg-white">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <h2 className="text-2xl font-extrabold text-[#1a2744] mb-1">{t("faqTitle")}</h2>
            <p className="text-gray-500 mb-8 text-sm">{t("faqSubtitle")}</p>
            <FaqAccordion />
          </FadeInUp>
        </div>
      </section>

      {/* Contact */}
      <section className="py-14 px-4 bg-[#f4f7fa]">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <div className="bg-white rounded-3xl border border-gray-100 p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <h2 className="text-xl font-bold text-[#1a2744] mb-1">{t("contactTitle")}</h2>
                <p className="text-sm text-gray-500">{t("contactSubtitle")}</p>
              </div>
              <div className="shrink-0 flex flex-col items-stretch sm:items-end gap-2">
                <Link
                  href="/soporte"
                  className="inline-flex items-center justify-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold px-6 py-3 rounded-full transition-all text-sm whitespace-nowrap"
                >
                  <MessageSquare className="h-4 w-4" />
                  {t("contactCta")}
                </Link>
                <a
                  href={SUPPORT_WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 text-xs text-[#9ca3af] hover:text-[#1ebe5d] transition-colors"
                >
                  <WhatsAppIcon className="h-3.5 w-3.5" /> {t("contactWhatsapp")}
                </a>
              </div>
            </div>
          </FadeInUp>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
