import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowRight, Briefcase } from "lucide-react";
import { CategoryCarousel } from "@/components/landing/category-carousel";
import { SmartRegisterLink } from "@/components/layout/smart-register-link";

/* "Profesionales para cada proyecto" — heading + ONE staggered category
   carousel (see category-carousel.tsx). Card visuals use the shared ServiceImage
   system (real photo or branded gradient fallback); each card → /buscar?categoria=<id>. */
export async function ProsSection() {
  const t = await getTranslations("landing.carousel");
  return (
    <section className="py-16 sm:py-24 bg-[#f4f7fa] overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744] leading-tight">
            {t("titlePre")} <span className="text-[#009FD9]">{t("titleHighlight")}</span>
          </h2>
        </div>
      </div>

      {/* Full-bleed single zigzag carousel — auto-scroll + drag/swipe + arrows. */}
      <CategoryCarousel />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/servicios"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#009FD9] hover:underline"
          >
            {t("viewAll")} <ArrowRight className="h-4 w-4" />
          </Link>
          <SmartRegisterLink className="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] border border-[#dbe7ef] bg-white px-4 text-sm font-bold text-[#162543] shadow-sm transition-all hover:border-[#009FD9] hover:text-[#0089bb]">
            <Briefcase className="h-4 w-4 text-[#009FD9]" />
            {t("offerCta")}
          </SmartRegisterLink>
        </div>
      </div>
    </section>
  );
}
