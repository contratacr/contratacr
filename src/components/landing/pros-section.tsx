import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { CategoryCarousel } from "@/components/landing/category-carousel";

/* "Profesionales para cada proyecto" — heading + ONE staggered category
   carousel (see category-carousel.tsx). Self-hosted Cloudinary images, each
   card → /buscar?categoria=<id>. No "available online" badge. */
export function ProsSection() {
  return (
    <section className="py-16 sm:py-24 bg-[#f4f7fa] overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744] leading-tight">
            Profesionales para cada <span className="text-[#009FD9]">proyecto</span>
          </h2>
          <p className="text-gray-500 mt-2">Explora los servicios más solicitados en Costa Rica.</p>
        </div>
      </div>

      {/* Full-bleed single zigzag carousel — auto-scroll + drag/swipe + arrows. */}
      <CategoryCarousel />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mt-10">
          <Link
            href="/categorias"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#009FD9] hover:underline"
          >
            Ver todas las categorías <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
