"use client";

import { useTranslations } from "next-intl";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { Link } from "@/i18n/navigation";
import {
  Camera, Star, MapPin, BriefcaseBusiness,
  CheckCircle2, UserCheck, Clock, Image as ImageIcon,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";

// Icons in code; tip text (title/body/highlight) comes from the i18n namespace.
const TIP_ICONS = [
  <Camera key="0" className="h-6 w-6" />,
  <UserCheck key="1" className="h-6 w-6" />,
  <ImageIcon key="2" className="h-6 w-6" />,
  <WhatsAppIcon key="3" className="h-6 w-6" />,
  <Star key="4" className="h-6 w-6" />,
  <MapPin key="5" className="h-6 w-6" />,
  <CheckCircle2 key="6" className="h-6 w-6" />,
  <Clock key="7" className="h-6 w-6" />,
];

const leadIconClass = "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#ccecf8] bg-[#EAF7FD] text-[#0089bb] shadow-[0_8px_20px_-18px_rgba(0,159,217,0.9)]";

export default function AtraerClientesPage() {
  const t = useTranslations("atraerClientes");
  const dos = t.raw("dos") as string[];
  const donts = t.raw("donts") as string[];
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero */}
      <section className="pt-32 pb-14 text-center px-4 bg-white">
        <FadeInUp>
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#009FD9] bg-[#EBF5FB] px-4 py-1.5 rounded-full mb-4">
            {t("eyebrow")}
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#1a2744] mb-4 leading-tight">
            {t("titleA")}<br className="hidden sm:block" />{" "}{t("titleB")}
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            {t("subtitle")}
          </p>
        </FadeInUp>
      </section>

      {/* Tips */}
      <section className="pb-20 px-4 bg-[#f4f7fa]">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-10">
              {TIP_ICONS.map((icon, i) => {
                const highlight = t(`tip${i}Highlight`);
                return (
                <FadeInUp key={i} delay={i * 40}>
                  <div className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-sm transition-shadow h-full">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={leadIconClass}>
                        {icon}
                      </div>
                      <h3 className="text-sm font-bold text-[#1a2744] leading-snug">{t(`tip${i}Title`)}</h3>
                    </div>
                    <p className="text-sm text-gray-500 leading-relaxed mb-2">{t(`tip${i}Body`)}</p>
                    {highlight && (
                      <p className="text-xs text-[#009FD9] font-medium bg-[#EBF5FB] rounded-lg px-3 py-2 mt-2">
                        {highlight}
                      </p>
                    )}
                  </div>
                </FadeInUp>
                );
              })}
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* Do / Don't */}
      <section className="py-20 px-4 bg-white">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <h2 className="text-2xl font-extrabold text-[#1a2744] mb-2 text-center">{t("dosDontsTitle")}</h2>
            <p className="text-gray-500 text-center text-sm mb-10">{t("dosDontsSubtitle")}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-emerald-700 mb-4 uppercase tracking-wide">{t("dosTitle")}</h3>
                <ul className="space-y-3">
                  {dos.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-red-600 mb-4 uppercase tracking-wide">{t("dontsTitle")}</h3>
                <ul className="space-y-3">
                  {donts.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-red-400 shrink-0 mt-0.5 font-bold">✕</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* CR market reality */}
      <section className="py-16 px-4 bg-[#f4f7fa]">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <div className="bg-white rounded-3xl border border-gray-100 p-8">
              <h2 className="text-xl font-bold text-[#1a2744] mb-4">{t("marketTitle")}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-600 leading-relaxed">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i}>
                    <p className="font-semibold text-[#1a2744] mb-2">{t(`market${i}Title`)}</p>
                    <p>{t(`market${i}Body`)}</p>
                  </div>
                ))}
              </div>
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-[#1a2744] text-center">
        <FadeInUp>
          <h2 className="text-2xl font-extrabold text-white mb-3">
            {t("ctaTitle")}
          </h2>
          <p className="text-[#93c5fd] mb-8 max-w-md mx-auto text-sm">
            {t("ctaSubtitle")}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/registro/profesional"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-7 py-3 text-sm font-black text-white transition-colors hover:bg-white/20"
            >
              <BriefcaseBusiness className="h-4 w-4" /> {t("ctaRegister")}
            </Link>
            <Link
              href="/dashboard/profesional"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-7 py-3 text-sm font-black text-white transition-colors hover:bg-white/20"
            >
              {t("ctaPanel")}
            </Link>
          </div>
        </FadeInUp>
      </section>

      <LandingFooter />
    </div>
  );
}
