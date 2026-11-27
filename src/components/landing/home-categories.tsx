import { getLocale, getTranslations } from "next-intl/server";
import { HomeCategoriesTabs } from "@/components/landing/home-categories-tabs";
import { sitemapSections } from "@/lib/directory/sitemap-sections";
import { DIRECTORY_SECTION_LABELS } from "@/lib/search/directory-search";
import { getCategoryGroupLabel } from "@/lib/data/categories";
import { sectionPhoto, serviceGroupPhoto } from "@/lib/visuals/section-visuals";

// Owner 2026-11-26: a service group and a business section in turn, 6 + 6 = 12 tiles (an even grid on phones and
// computers), with the SAME photos as the Servicios and Negocios tabs of /categorias. "Ver todas" opens Categorías.
const SERVICES = ["hogar", "limpieza", "construccion_ingenieria", "belleza", "salud", "automotriz"];
const ORDER = ["restaurantes", "hospedaje", "farmacias", "supermercados", "gasolineras", "talleres", "cafes", "parqueos", "lavacar", "belleza", "veterinarias"];

/**
 * Home, directory on (owner 2026-11-26): «Categorías» with real photos, like the production service cards — Profesionales
 * first, then the main business sections, and "Ver todas" next to the title.
 */
export async function HomeCategories() {
  const enabled = sitemapSections().map((s) => s.section as string);
  if (!enabled.length) return null;
  const locale = await getLocale();
  const t = await getTranslations("landing.homeCategories");
  const label = (id: string) => (DIRECTORY_SECTION_LABELS[id] as Record<string, string> | undefined)?.[locale] ?? DIRECTORY_SECTION_LABELS[id]?.es ?? id;
  const services = SERVICES.filter((id) => serviceGroupPhoto(id)).map((id) => ({ key: `s-${id}`, href: `/profesionales?grupo=${id}`, label: getCategoryGroupLabel(id, locale), photo: serviceGroupPhoto(id)! }));
  const places = ORDER.filter((id) => enabled.includes(id) && sectionPhoto(id)).slice(0, 6).map((id) => ({ key: id, href: `/${id}`, label: label(id), photo: sectionPhoto(id)! }));
  const tp = await getTranslations("categoriesPage");
  return (
    <HomeCategoriesTabs title={t("title")} allLabel={t("all")} allShort={t("allShort")} tabs={[
      { id: "servicios", label: tp("prosTitle"), items: services },
      { id: "negocios", label: tp("placesTitle"), items: places },
    ]} />
  );
}
