import { getTranslations, getLocale } from "next-intl/server";
import { Search, BadgeCheck, Headset, ArrowRight } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { PhoneFrame, ResultsScreen, buildLandingResultsCopy } from "@/components/landing/phone-screens";
import { SmartRegisterLink } from "@/components/layout/smart-register-link";
import { Link } from "@/i18n/navigation";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { InstallHomeLink } from "@/components/landing/install-app-card";

/* "Así funciona ContrataCR" — ONE phone (the best/most representative app
   screen) with all the key info organized beside it. Merges how-it-works,
   trust and the professional pitch. Monochrome icons (serious tone).
   Copy lives in the landing.howItWorks namespace (ES/EN). */
const POINTS = [
  { Icon: Search, key: "point0" },
  { Icon: BadgeCheck, key: "point1" },
  { Icon: WhatsAppIcon, key: "point2" },
  { Icon: Headset, key: "point3" },
];

const leadIconClass = "mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#ccecf8] bg-[#EAF7FD] text-[#0089bb] shadow-[0_8px_20px_-18px_rgba(0,159,217,0.9)]";

export async function WhyContratacr() {
  const t = await getTranslations("landing.howItWorks");
  const tCard = await getTranslations("card");
  const tSched = await getTranslations("schedule");
  const locale = await getLocale();

  const resultsCopy = buildLandingResultsCopy({ locale, tLanding: t, tCard, tSchedule: tSched });

  return (
    <section className="relative overflow-hidden py-20 sm:py-28 bg-white">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EBF5FB] text-[#009FD9] px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
            <span className="h-1.5 w-1.5 rounded-full bg-[#009FD9]" /> {t("eyebrow")}
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-[#1a2744]">{t("heading")}</h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Info */}
          <FadeInUp className="lg:order-1 order-2">
            <ul className="space-y-6">
              {POINTS.map(({ Icon, key }) => (
                <li key={key} className="flex items-start gap-4">
                  <span className={leadIconClass}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-[#1a2744] leading-snug">{t(`${key}Title`)}</p>
                    <p className="text-sm text-gray-500 leading-relaxed">{t(`${key}Desc`)}</p>
                  </div>
                </li>
              ))}
            </ul>

            {/* Professional pitch + CTA */}
            <div className="mt-8 rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] p-5">
              <p className="font-bold text-[#1a2744]">{t("pitchTitle")}</p>
              <p className="mt-1 text-sm text-gray-500 leading-relaxed">
                {t("pitchDesc")}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <SmartRegisterLink className="inline-flex items-center gap-1.5 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] px-5 py-2.5 text-sm font-bold text-white transition-colors shadow-[0_10px_26px_rgba(0,159,217,0.3)]">
                  {t("pitchCta")} <ArrowRight className="h-4 w-4" />
                </SmartRegisterLink>
                <Link href="/como-funciona" className="text-sm font-bold text-[#009FD9] hover:underline">{t("pitchHow")}</Link>
              </div>
            </div>

            <InstallHomeLink />
          </FadeInUp>

          {/* One phone — floats cleanly on the section, just a soft shadow */}
          <FadeInUp delay={120} className="lg:order-2 order-1">
            <div className="relative flex justify-center">
              {/* subtle ground shadow only — no container/box behind the phone */}
              <div aria-hidden className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 h-6 w-52 rounded-[50%] bg-[#1a2744]/15 blur-2xl" />
              <PhoneFrame><ResultsScreen copy={resultsCopy} /></PhoneFrame>
            </div>
          </FadeInUp>
        </div>
      </div>
    </section>
  );
}
