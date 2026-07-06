import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CategoryCarousel } from "@/components/landing/category-carousel";

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
