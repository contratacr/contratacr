import { getTranslations, getLocale } from "next-intl/server";
import { Search, CalendarDays, BadgeCheck, MessageCircle } from "lucide-react";
import { PhoneFrame, ResultsScreen, buildLandingResultsCopy } from "@/components/landing/phone-screens";
import { Link } from "@/i18n/navigation";
import { FadeInUp } from "@/components/landing/fade-in-up";

/* "Así funciona ContrataCR" — ONE phone (the best/most representative app
   screen) with all the key info organized beside it. Merges how-it-works,
   trust and the professional pitch. Monochrome icons (serious tone).
   Copy lives in the landing.howItWorks namespace (ES/EN). */
const POINTS = [
  { Icon: Search, key: "point0" },
  { Icon: CalendarDays, key: "point1" },
  { Icon: MessageCircle, key: "point2" },
  { Icon: BadgeCheck, key: "point3" },
];

const leadIconClass = "absolute -left-[18px] top-0 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-4 border-white bg-[#EAF7FD] text-[#0089bb] shadow-[0_8px_18px_-14px_rgba(0,159,217,0.9)]";

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
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744]">{t("heading")}</h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto">
            {t("subtitle")}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2">
            <Link
              href="/como-funciona"
              className="text-sm font-bold text-[#009FD9] transition-colors hover:text-[#007da8] hover:underline"
            >
              {t("guideCta")}
            </Link>
            <Link
              href="/ayuda#agregar-a-inicio"
              className="text-sm font-bold text-[#009FD9] transition-colors hover:text-[#007da8] hover:underline"
            >
              {t("installLink")}
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,430px)] gap-12 lg:gap-16 items-center">
          {/* Info */}
          <FadeInUp className="lg:order-1 order-2">
            <div className="max-w-xl">
              <span className="inline-flex rounded-full bg-[#F1F8FC] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#009FD9]">
                {t("flowLabel")}
              </span>
              <h3 className="mt-4 text-2xl font-extrabold leading-tight text-[#1a2744] sm:text-3xl">
                {t("flowTitle")}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-500 sm:text-base">
                {t("flowDesc")}
              </p>
            </div>

            <ol className="relative mt-8 ml-[18px] space-y-6 border-l border-[#d7edf7]">
              {POINTS.map(({ Icon, key }) => (
                <li key={key} className="relative pl-8">
                  <span className={leadIconClass}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-[#1a2744] leading-snug">{t(`${key}Title`)}</p>
                    <p className="text-sm text-gray-500 leading-relaxed">{t(`${key}Desc`)}</p>
                  </div>
                </li>
              ))}
            </ol>
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
