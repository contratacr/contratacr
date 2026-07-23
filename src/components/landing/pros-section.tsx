import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CategoryCarousel } from "@/components/landing/category-carousel";
import { SmartRegisterLink } from "@/components/layout/smart-register-link";

/* "Profesionales para cada proyecto" — heading + ONE staggered category
   carousel (see category-carousel.tsx). Card visuals use the shared ServiceImage
   system (real photo or branded gradient fallback); each card → /buscar?categoria=<id>. */
export async function ProsSection() {
  const t = await getTranslations("landing.carousel");
  const heroT = await getTranslations("landing.hero");
  return (
    <section className="ccr-home-services-section pt-24 pb-16 sm:py-24 bg-[#f4f7fa] overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744] leading-tight">
            {t("titlePre")} <span className="text-[#009FD9]">{t("titleHighlight")}</span>
          </h2>
          <div className="mt-4 flex justify-center">
            <SmartRegisterLink className="inline-flex min-h-10 w-full max-w-[230px] items-center justify-center rounded-lg bg-[#009FD9] px-4 text-sm font-extrabold text-white shadow-[0_12px_28px_-20px_rgba(0,159,217,0.95)] transition-colors hover:bg-[#0089bb] sm:w-auto sm:max-w-none sm:px-5">
              {heroT("proCta")}
            </SmartRegisterLink>
          </div>
        </div>
      </div>

      {/* Full-bleed single zigzag carousel — auto-scroll + drag/swipe + arrows. */}
      <CategoryCarousel />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mt-10">
          <Link
            href="/servicios"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#009FD9] hover:underline"
          >
            {t("viewAll")}
          </Link>
        </div>
      </div>
    </section>
  );
}
