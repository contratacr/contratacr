import { Users, ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PlaceTiles } from "@/components/directory/place-tiles";
import { sitemapSections } from "@/lib/directory/sitemap-sections";
import { CURATED_PLACE_SECTIONS } from "@/lib/directory/directory-groups";

/**
 * Home, directory on (owner 2026-11-26): «Categorías» like the Categorías page — the Profesionales tile first, then the
 * business sections as brand tiles, and «Ver todas las categorías» under them.
 */
export async function HomeCategories() {
  const enabled = sitemapSections().map((s) => s.section as string);
  if (!enabled.length) return null;
  const locale = await getLocale();
  const t = await getTranslations("landing.homeCategories");
  const tp = await getTranslations("categoriesPage");
  const sections = CURATED_PLACE_SECTIONS.filter((s) => enabled.includes(s)).slice(0, 7);
  return (
    <section data-home-categories className="bg-white px-4 pb-6 pt-5">
      <h2 className="mb-4 text-center text-[clamp(1.15rem,6.3vw,2.25rem)] font-extrabold leading-tight text-[#1a2744] sm:mb-8 sm:text-4xl">{t("title")}</h2>
      <div className="mx-auto max-w-6xl">
        <PlaceTiles sections={sections} totals={{}} locale={locale} leading={
          <li>
            <Link href="/profesionales" prefetch={false} data-home-pros-tile className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-[#e5e9ee] bg-white text-left shadow-sm transition-colors hover:border-[#009FD9]">
              <span aria-hidden className="grid h-20 w-full place-items-center bg-[linear-gradient(135deg,#dff3fc,#b9e3f6)] text-[#0083b0] sm:h-24"><Users className="h-9 w-9 sm:h-11 sm:w-11" strokeWidth={1.75} /></span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 p-3">
                <span className="text-[15px] font-extrabold leading-tight text-[#162543] group-hover:text-[#0083b0]">{tp("prosTile")}</span>
                <span className="line-clamp-2 text-xs leading-snug text-[#64748b]">{tp("prosTileAll")}</span>
              </span>
            </Link>
          </li>
        } />
        <Link href="/categorias" prefetch={false} className="mt-5 flex items-center justify-center gap-1 text-[15px] font-bold text-[#009FD9]">{t("all")}<ChevronRight className="h-4 w-4" aria-hidden /></Link>
      </div>
    </section>
  );
}
