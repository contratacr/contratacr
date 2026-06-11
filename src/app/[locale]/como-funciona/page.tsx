"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { Link } from "@/i18n/navigation";
import {
  ChevronDown, Search, BadgeCheck, MessageCircle, FileText,
  Bell, Users, Banknote, CalendarClock, ArrowRight,
} from "lucide-react";

function FaqAccordion() {
  const t = useTranslations("comoFunciona");
  const [open, setOpen] = useState<number | null>(null);
  const items = [0, 1, 2, 3, 4];
  return (
    <div className="divide-y divide-gray-100">
      {items.map((i) => (
        <div key={i}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between py-5 text-left gap-4 group"
          >
            <span className="text-base font-semibold text-[#1a2744] group-hover:text-[#009FD9] transition-colors">
              {t(`faq${i}Q`)}
            </span>
            <ChevronDown
              className={`h-5 w-5 text-gray-400 shrink-0 transition-transform duration-200 ${open === i ? "rotate-180 text-[#009FD9]" : ""}`}
            />
          </button>
          {open === i && (
            <p className="pb-5 text-sm text-gray-500 leading-relaxed">{t(`faq${i}A`)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Mini step card ── */
function MiniStep({ n, label, sub }: { n: number; label: string; sub: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-7 w-7 rounded-full bg-[#009FD9] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {n}
      </div>
      <div>
        <p className="text-sm font-semibold text-[#1a2744]">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{sub}</p>
      </div>
    </div>
  );
}

export default function ComoFuncionaPage() {
  const t = useTranslations("comoFunciona");
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero */}
      <section className="pt-32 pb-16 bg-white text-center px-4">
        <FadeInUp>
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#009FD9] bg-[#EBF5FB] px-4 py-1.5 rounded-full mb-4">
            {t("eyebrow")}
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#1a2744] mb-4 leading-tight">
            {t("titleA")}<br className="hidden sm:block" />{" "}{t("titleB")}
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            {t("subtitle")}
          </p>
        </FadeInUp>
      </section>

      {/* Two paths */}
      <section className="pb-20 px-4">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Path 1 — Search */}
              <div className="bg-white border-2 border-[#e5e7eb] rounded-3xl p-8 hover:border-[#009FD9]/40 hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-12 w-12 rounded-2xl bg-[#EBF5FB] flex items-center justify-center">
                    <Search className="h-6 w-6 text-[#009FD9]" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#009FD9]">{t("opt1Badge")}</p>
                    <h2 className="text-xl font-bold text-[#1a2744]">{t("opt1Title")}</h2>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                  {t("opt1Desc")}
                </p>
                <div className="flex flex-col gap-4">
                  <MiniStep n={1} label={t("opt1Step1Title")} sub={t("opt1Step1Sub")} />
                  <MiniStep n={2} label={t("opt1Step2Title")} sub={t("opt1Step2Sub")} />
                  <MiniStep n={3} label={t("opt1Step3Title")} sub={t("opt1Step3Sub")} />
                </div>
                <Link
                  href="/buscar"
                  className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#009FD9] hover:underline"
                >
                  {t("opt1Cta")} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              {/* Path 2 — Post project */}
              <div className="bg-white border-2 border-[#e5e7eb] rounded-3xl p-8 hover:border-[#009FD9]/40 hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-12 w-12 rounded-2xl bg-[#EBF5FB] flex items-center justify-center">
                    <FileText className="h-6 w-6 text-[#009FD9]" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#009FD9]">{t("opt2Badge")}</p>
                    <h2 className="text-xl font-bold text-[#1a2744]">{t("opt2Title")}</h2>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                  {t("opt2Desc")}
                </p>
                <div className="flex flex-col gap-4">
                  <MiniStep n={1} label={t("opt2Step1Title")} sub={t("opt2Step1Sub")} />
                  <MiniStep n={2} label={t("opt2Step2Title")} sub={t("opt2Step2Sub")} />
                  <MiniStep n={3} label={t("opt2Step3Title")} sub={t("opt2Step3Sub")} />
                </div>
                <Link
                  href="/publicar-proyecto"
                  className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#009FD9] hover:underline"
                >
                  {t("opt2Cta")} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

            </div>
          </FadeInUp>
        </div>
      </section>

      {/* Para profesionales */}
      <section className="py-20 px-4" style={{ background: "#EBF5FB" }}>
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <div className="text-center">
              <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#009FD9] bg-white px-4 py-1.5 rounded-full mb-4">
                {t("prosBadge")}
              </span>
              <h2 className="text-3xl font-extrabold text-[#1a2744] mb-4">
                {t("prosTitle")}
              </h2>
              <p className="text-gray-500 mb-8 text-sm leading-relaxed max-w-xl mx-auto">
                {t("prosSubtitle")}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                {[
                  { Icon: Banknote, key: "benefit0" },
                  { Icon: BadgeCheck, key: "benefit1" },
                  { Icon: Users, key: "benefit2" },
                  { Icon: CalendarClock, key: "benefit3" },
                ].map(({ Icon, key }) => (
                  <div key={key} className="bg-white rounded-2xl p-4 text-center border border-white/80">
                    <Icon className="h-6 w-6 text-[#009FD9] mx-auto mb-2" />
                    <p className="text-xs font-semibold text-[#374151]">{t(key)}</p>
                  </div>
                ))}
              </div>
              <Link
                href="/registro/profesional"
                className="inline-flex items-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold px-8 py-3.5 rounded-full transition-all shadow-sm hover:shadow-[0_4px_20px_rgba(0,159,217,0.35)]"
              >
                {t("prosCta")} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </FadeInUp>

          {/* How projects work for pros */}
          <FadeInUp delay={80}>
            <div className="mt-12 bg-white rounded-3xl p-8 border border-white/80">
              <div className="flex items-center gap-3 mb-5">
                <Bell className="h-5 w-5 text-[#009FD9]" />
                <h3 className="text-base font-bold text-[#1a2744]">{t("projectsTitle")}</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                {[
                  { icon: "📋", key: "proj0" },
                  { icon: "✉️", key: "proj1" },
                  { icon: "🤝", key: "proj2" },
                ].map(({ icon, key }) => (
                  <div key={key} className="p-4">
                    <div className="text-3xl mb-2">{icon}</div>
                    <p className="text-sm font-semibold text-[#1a2744] mb-1">{t(`${key}Title`)}</p>
                    <p className="text-xs text-gray-400">{t(`${key}Sub`)}</p>
                  </div>
                ))}
              </div>
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 bg-white">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <h2 className="text-3xl font-extrabold text-[#1a2744] mb-2 text-center">
              {t("faqTitle")}
            </h2>
            <p className="text-gray-500 text-center mb-10">
              {t("faqSubtitle")}
            </p>
            <FaqAccordion />
          </FadeInUp>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 px-4 bg-[#1a2744] text-center">
        <FadeInUp>
          <h2 className="text-3xl font-extrabold text-white mb-3">
            {t("ctaTitle")}
          </h2>
          <p className="text-[#93c5fd] mb-8 max-w-md mx-auto text-sm">
            {t("ctaSubtitle")}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/buscar"
              className="inline-flex items-center justify-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold px-7 py-3 rounded-full transition-all"
            >
              <Search className="h-4 w-4" /> {t("ctaSearch")}
            </Link>
            <Link
              href="/publicar-proyecto"
              className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold px-7 py-3 rounded-full transition-all border border-white/20"
            >
              <MessageCircle className="h-4 w-4" /> {t("ctaPublish")}
            </Link>
          </div>
        </FadeInUp>
      </section>

      <LandingFooter />
    </div>
  );
}
