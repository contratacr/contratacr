import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Search, CalendarDays, BadgeCheck, MessageCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { FadeInUp } from "@/components/landing/fade-in-up";

/* "Asi funciona ContrataCR" - one clean phone with the real app screen. */
const POINTS = [
  { Icon: Search, key: "point0" },
  { Icon: CalendarDays, key: "point1" },
  { Icon: MessageCircle, key: "point2" },
  { Icon: BadgeCheck, key: "point3" },
];

const leadIconClass = "absolute -left-[18px] top-0 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-4 border-white bg-[#EAF7FD] text-[#0089bb] shadow-[0_8px_18px_-14px_rgba(0,159,217,0.9)]";

export async function WhyContratacr() {
  const t = await getTranslations("landing.howItWorks");

  return (
    <section className="relative overflow-hidden bg-[#f4f7fa] py-20 sm:py-28">
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

          {/* One clean phone with the real app screen */}
          <FadeInUp delay={120} className="lg:order-2 order-1">
            <div className="relative flex justify-center">
              <div aria-hidden className="pointer-events-none absolute bottom-1 left-1/2 h-6 w-48 -translate-x-1/2 rounded-[50%] bg-[#1a2744]/10 blur-2xl" />
              <div className="relative w-[284px] sm:w-[304px] lg:w-[326px]">
                <div aria-hidden className="absolute -left-[2px] top-[116px] h-8 w-[3px] rounded-l-sm bg-[#2b2f36]" />
                <div aria-hidden className="absolute -left-[2px] top-[162px] h-12 w-[3px] rounded-l-sm bg-[#2b2f36]" />
                <div aria-hidden className="absolute -left-[2px] top-[208px] h-12 w-[3px] rounded-l-sm bg-[#2b2f36]" />
                <div aria-hidden className="absolute -right-[2px] top-[150px] h-16 w-[3px] rounded-r-sm bg-[#2b2f36]" />

                <div
                  className="relative"
                  style={{
                    background: "linear-gradient(135deg,#f1f3f6 0%,#c6cbd2 18%,#777c85 50%,#c6cbd2 82%,#f1f3f6 100%)",
                    borderRadius: 56,
                    padding: 3,
                    boxShadow:
                      "0 50px 100px -28px rgba(15,23,42,0.50), 0 24px 48px -22px rgba(15,23,42,0.42), inset 0 0 0 0.5px rgba(255,255,255,0.45)",
                  }}
                >
                  <div className="relative" style={{ background: "#04060a", borderRadius: 53, padding: 8 }}>
                    <div className="relative overflow-hidden bg-white" style={{ borderRadius: 46 }}>
                      <Image
                        src="/landing-professionals-search.png"
                        alt="Resultados de profesionales en ContrataCR"
                        width={419}
                        height={928}
                        sizes="(max-width: 640px) 284px, (max-width: 1024px) 304px, 326px"
                        className="block h-auto w-full"
                        priority
                      />
                      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-20 h-16 bg-gradient-to-b from-white/14 to-transparent" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </FadeInUp>
        </div>
      </div>
    </section>
  );
}

