import { ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { sitemapSections } from "@/lib/directory/sitemap-sections";
import { DIRECTORY_SECTION_LABELS } from "@/lib/search/directory-search";
import { categoryImageUrl } from "@/lib/data/category-images";
import { sectionPhoto } from "@/lib/directory/section-photos";

// Professionals + 11 sections = 12 tiles (an even grid on phones and computers), the most used first (owner 2026-11-26).
const ORDER = ["restaurantes", "hospedaje", "farmacias", "supermercados", "parqueos", "lavacar", "gasolineras", "talleres", "cafes", "belleza", "veterinarias"];

/**
 * Home, directory on (owner 2026-11-26): «Categorías» with real photos, like the production service cards — Profesionales
 * first, then the main business sections, and "Ver todas" next to the title.
 */
export async function HomeCategories() {
  const enabled = sitemapSections().map((s) => s.section as string);
  if (!enabled.length) return null;
  const locale = await getLocale();
  const t = await getTranslations("landing.homeCategories");
  const tp = await getTranslations("categoriesPage");
  const label = (id: string) => (DIRECTORY_SECTION_LABELS[id] as Record<string, string> | undefined)?.[locale] ?? DIRECTORY_SECTION_LABELS[id]?.es ?? id;
  const items = [
    { key: "pros", href: "/categorias", label: tp("prosTile"), photo: categoryImageUrl("electricidad")!.replace("w=1100", "w=700") },
    ...ORDER.filter((id) => enabled.includes(id) && sectionPhoto(id)).map((id) => ({ key: id, href: `/${id}`, label: label(id), photo: sectionPhoto(id)! })),
  ];
  return (
    <section data-home-categories className="bg-white px-4 pb-6 pt-5">
      {/* Same header as "Mejor calificados" (owner 2026-11-26): title on the left, the link to all categories on the right. */}
      <div className="mx-auto mb-3 flex max-w-6xl items-center justify-between gap-3 sm:mb-5">
        <h2 className="text-[22px] font-extrabold leading-tight text-[#1a2744] sm:text-3xl">{t("title")}</h2>
        <Link href="/categorias" prefetch={false} aria-label={t("all")} className="flex shrink-0 items-center gap-0.5 text-[15px] font-bold text-[#0083b0]">{t("allShort")}<ChevronRight className="h-4 w-4" aria-hidden /></Link>
      </div>
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
    </section>
  );
}
