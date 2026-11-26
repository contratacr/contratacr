import { ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { sitemapSections } from "@/lib/directory/sitemap-sections";
import { DIRECTORY_SECTION_LABELS } from "@/lib/search/directory-search";
import { categoryImageUrl } from "@/lib/data/category-images";
import { sectionPhoto } from "@/lib/directory/section-photos";

const ORDER = ["restaurantes", "farmacias", "supermercados", "gasolineras", "talleres", "cafes", "belleza"];

/**
 * Home, directory on (owner 2026-11-26): «Categorías» with real photos, like the production service cards — Profesionales
 * first, then the main business sections, and «Ver todas las categorías».
 */
export async function HomeCategories() {
  const enabled = sitemapSections().map((s) => s.section as string);
  if (!enabled.length) return null;
  const locale = await getLocale();
  const t = await getTranslations("landing.homeCategories");
  const tp = await getTranslations("categoriesPage");
  const label = (id: string) => (DIRECTORY_SECTION_LABELS[id] as Record<string, string> | undefined)?.[locale] ?? DIRECTORY_SECTION_LABELS[id]?.es ?? id;
  const items = [
    { key: "pros", href: "/profesionales", label: tp("prosTile"), photo: categoryImageUrl("electricidad")!.replace("w=1100", "w=700") },
    ...ORDER.filter((id) => enabled.includes(id) && sectionPhoto(id)).map((id) => ({ key: id, href: `/${id}`, label: label(id), photo: sectionPhoto(id)! })),
  ];
  return (
    <section data-home-categories className="bg-white px-4 pb-6 pt-5">
      <h2 className="mb-4 text-center text-[clamp(1.15rem,6.3vw,2.25rem)] font-extrabold leading-tight text-[#1a2744] sm:mb-8 sm:text-4xl">{t("title")}</h2>
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {items.map((i) => (
          <li key={i.key}>
            <Link href={i.href} prefetch={false} data-home-category={i.key} className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-[#e8eef3] shadow-[0_6px_18px_-12px_rgba(15,23,42,0.45)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote CDN photo, sized by the URL */}
              <img src={i.photo} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06] group-active:scale-[1.06]" />
              <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.25) 25%, rgba(0,0,0,0) 45%)" }} />
              <span className="absolute inset-x-0 bottom-0 p-3.5 text-[15px] font-bold leading-tight text-white drop-shadow sm:p-4 sm:text-base lg:p-6 lg:text-2xl">{i.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/categorias" prefetch={false} className="mt-5 flex items-center justify-center gap-1 text-[15px] font-bold text-[#009FD9]">{t("all")}<ChevronRight className="h-4 w-4" aria-hidden /></Link>
    </section>
  );
}
