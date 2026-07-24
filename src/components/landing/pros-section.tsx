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
          <div className="mt-3 flex justify-center">
            <SmartRegisterLink className="inline-flex items-center justify-center text-sm font-extrabold text-[#009FD9] transition-colors hover:text-[#0089BB] hover:underline">
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
