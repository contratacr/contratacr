"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { InstallAppGuide } from "@/components/landing/install-app-card";
import { Link } from "@/i18n/navigation";
import {
  CalendarDays,
  ChevronDown,
  Headset,
  Search,
  ShieldCheck,
  Smartphone,
  Star,
  UserCheck,
} from "lucide-react";

const TOPICS = [
  { icon: UserCheck, faq: 1 },
  { icon: Search, faq: 3 },
  { icon: ShieldCheck, faq: 2 },
  { icon: CalendarDays, faq: 6 },
  { icon: Star, faq: 5 },
  { icon: Smartphone, faq: 8 },
];

export default function AyudaPage() {
  const t = useTranslations("ayuda");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  useEffect(() => {
    if (window.location.hash !== "#agregar-a-inicio") return;
    const timer = window.setTimeout(() => {
      setShowInstallGuide(true);
      requestAnimationFrame(() => document.getElementById("agregar-a-inicio")?.scrollIntoView({ block: "start" }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function selectTopic(faq: number) {
    setOpenFaq(faq);
    requestAnimationFrame(() => document.getElementById(`faq-${faq}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function openInstallGuide() {
    setShowInstallGuide(true);
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("agregar-a-inicio")?.scrollIntoView({ behavior: "smooth", block: "start" })));
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <LandingNavbar />
      <main className="flex-1">
        <section className="border-b border-[#e5e7eb] px-4 pb-10 pt-24 sm:pb-12 sm:pt-32">
          <div className="mx-auto max-w-4xl">
            <p className="text-xs font-bold uppercase text-[#009fd9]">{t("eyebrow")}</p>
            <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <h1 className="text-3xl font-black leading-tight text-[#162543] sm:text-5xl">{t("title")}</h1>
                <p className="mt-3 max-w-xl text-base leading-7 text-[#6b7280]">{t("subtitle")}</p>
              </div>
              <Link href="/soporte" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#cdd8e1] px-5 text-sm font-bold text-[#162543] hover:border-[#009fd9] hover:text-[#0089bb]">
                <Headset className="h-4 w-4" />{t("contactCta")}
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-[#f4f7fa] px-4 py-10 sm:py-14">
          <div className="mx-auto grid max-w-4xl gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <aside>
              <h2 className="text-sm font-extrabold text-[#162543]">{t("topicsTitle")}</h2>
              <p className="mt-1 text-sm leading-6 text-[#6b7280]">{t("topicsSubtitle")}</p>
              <nav className="mt-5 space-y-2" aria-label={t("topicsTitle")}>
                {TOPICS.map(({ icon: Icon, faq }, index) => (
                  <button key={index} type="button" onClick={() => selectTopic(faq)} className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${openFaq === faq ? "border-[#9bd8ef] bg-[#eaf7fd] text-[#0089bb]" : "border-[#dfe5eb] bg-white text-[#162543] hover:border-[#b8dcea]"}`}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-bold">{t(`cat${index}Title`)}</span>
                  </button>
                ))}
              </nav>
            </aside>

            <div className="rounded-lg border border-[#dfe5eb] bg-white px-5 sm:px-7">
              <div className="border-b border-[#e5e7eb] py-5">
                <h2 className="text-xl font-extrabold text-[#162543]">{t("faqTitle")}</h2>
                <p className="mt-1 text-sm text-[#6b7280]">{t("faqSubtitle")}</p>
              </div>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
                <div key={index} id={`faq-${index}`} className="scroll-mt-28 border-b border-[#edf0f3] last:border-0">
                  <button type="button" onClick={() => setOpenFaq(openFaq === index ? null : index)} aria-expanded={openFaq === index} className="flex w-full items-center justify-between gap-4 py-5 text-left">
                    <span className="text-sm font-bold leading-6 text-[#162543]">{t(`faq${index}Q`)}</span>
                    <ChevronDown className={`h-5 w-5 shrink-0 text-[#9ca3af] transition-transform ${openFaq === index ? "rotate-180 text-[#009fd9]" : ""}`} />
                  </button>
                  {openFaq === index && (
                    <p className="pb-5 text-sm leading-6 text-[#6b7280]">
                      {t(`faq${index}A`)}
                      {index === 8 && <>{" "}<button type="button" onClick={openInstallGuide} className="font-bold text-[#0089bb] hover:underline">{t("faq8Link")}</button></>}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {showInstallGuide && <InstallAppGuide />}

        <section className="border-t border-[#e5e7eb] px-4 py-12">
          <div className="mx-auto flex max-w-4xl flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
            <div><h2 className="text-xl font-extrabold text-[#162543]">{t("contactTitle")}</h2><p className="mt-1 text-sm text-[#6b7280]">{t("contactSubtitle")}</p></div>
            <Link href="/soporte" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white hover:bg-[#0089bb]"><Headset className="h-4 w-4" />{t("contactCta")}</Link>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
