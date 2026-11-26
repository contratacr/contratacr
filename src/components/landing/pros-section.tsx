import { getLocale, getTranslations } from "next-intl/server";
import { ServiciosPorSeccion, type SeccionDeServicios } from "@/components/landing/servicios-por-seccion";
import { DEMANDA_DE_SERVICIOS } from "@/lib/data/home-categories";
import { CATEGORY_GROUPS, CATEGORY_GROUP_LABELS_EN, getCategoryLabel } from "@/lib/data/categories";
import { categoryGroupId, categoryImageUrl } from "@/lib/data/category-images";
import { getSupplyCounts } from "@/lib/queries/supply";
import { rutaDeBusqueda } from "@/lib/buscar-url";
import { sitemapSections } from "@/lib/directory/sitemap-sections";
import { placeSection } from "@/lib/directory/place-verticals";
import { DIRECTORY_SECTION_LABELS } from "@/lib/search/directory-search";

/* «Profesionales para cada proyecto, cerca de ti»: pestañas por sección y, en
   cada una, sus servicios MÁS BUSCADOS (DEMANDA_DE_SERVICIOS). Solo servicios con
   al menos 2 profesionales —la portada no promete lo que no hay— y con foto; y
   solo secciones con al menos 2 de esos servicios. Las secciones van en orden de
   demanda: la de su servicio más buscado primero. */
export async function ProsSection() {
  const t = await getTranslations("landing.carousel");
  const locale = await getLocale();
  const supply = await getSupplyCounts();
  const rango = new Map(DEMANDA_DE_SERVICIOS.map((id, i) => [id, i]));
  const orden = (id: string) => rango.get(id) ?? 1000 - Math.min(999, supply.byCategory[id] ?? 0);

  // CUATRO POR SECCIÓN, todos con profesionales de verdad. Primero los que
  // tienen ≥2 profesionales, por demanda; si no llegan a cuatro, se completa
  // con los que tienen al menos 1. Una sección que ni así llega a cuatro no
  // sale: la portada no promete servicios vacíos.
  const sinDatos = supply.total === 0;
  const oferta = (id: string) => (sinDatos ? 2 : (supply.byCategory[id] ?? 0));
  const todos = new Set<string>([...DEMANDA_DE_SERVICIOS, ...Object.keys(supply.byCategory)]);
  const porSeccion = new Map<string, string[]>();
  for (const id of todos) {
    if (oferta(id) < 1 || !categoryImageUrl(id)) continue;
    const grupo = categoryGroupId(id);
    if (!grupo) continue;
    porSeccion.set(grupo, [...(porSeccion.get(grupo) ?? []), id]);
  }
  const cuatro = (ids: string[]) => {
    const fuertes = ids.filter((id) => oferta(id) >= 2).sort((a, b) => orden(a) - orden(b));
    const resto = ids.filter((id) => oferta(id) < 2).sort((a, b) => orden(a) - orden(b));
    return [...fuertes, ...resto].slice(0, 4);
  };

  const secciones: SeccionDeServicios[] = CATEGORY_GROUPS
    .map((g) => ({ g, ids: cuatro(porSeccion.get(g.id) ?? []) }))
    .filter(({ ids }) => ids.length === 4)
    .sort((a, b) => orden(a.ids[0]) - orden(b.ids[0]))
    .slice(0, 9)
    .map(({ g, ids }) => ({
      id: g.id,
      label: (locale === "en" && CATEGORY_GROUP_LABELS_EN[g.id]) || g.label,
      servicios: ids.map((id) => ({ id, label: getCategoryLabel(id, locale), href: rutaDeBusqueda({ categoria: id }) })),
    }));

  // Directory on (test, owner 2026-11-26): «Lo más buscado» — the professional sections first, then one Empresas tab with
  // the most used business sections. With the directory off this is exactly the production block.
  const enabled = sitemapSections().map((x) => x.section as string);
  const directoryOn = enabled.length > 0;
  if (directoryOn) {
    // Every business section that is on (owner 2026-11-26: «todo», not just four), most used first.
    const ORDER = ["restaurantes", "farmacias", "supermercados", "gasolineras", "cafes", "talleres", "ferreterias", "belleza", "veterinarias", "salud", "gimnasios", "pulperias", "bancos", "hospedaje", "tours"];
    const empresas = [...ORDER, ...enabled.filter((id) => !ORDER.includes(id))].filter((id) => enabled.includes(id) && placeSection(id));
    if (empresas.length >= 2) secciones.push({
      id: "empresas-directorio",
      label: t("companiesTab"),
      icono: "store",
      servicios: empresas.map((id) => ({ id, label: (DIRECTORY_SECTION_LABELS[id] as Record<string, string> | undefined)?.[locale] ?? DIRECTORY_SECTION_LABELS[id]?.es ?? id, href: `/${id}`, place: placeSection(id)!.id })),
    });
  }

  return (
    <section className="ccr-home-services-section bg-white pb-5 pt-5 sm:pb-7 sm:pt-7">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className={`mb-4 whitespace-nowrap text-[clamp(1.15rem,6.3vw,2.25rem)] font-extrabold leading-tight text-[#1a2744] sm:mb-8 sm:text-center sm:text-4xl${directoryOn ? " text-center" : ""}`}>
          {directoryOn
            ? <>{t("titleDirectoryPre")} <span className="text-[#009FD9]">{t("titleDirectoryHighlight")}</span></>
            : <>{t("titlePre")} <span className="text-[#009FD9]">{t("titleHighlight")}</span></>}
        </h2>
        <ServiciosPorSeccion secciones={secciones} verTodos={{ href: directoryOn ? "/categorias" : "/servicios", label: directoryOn ? t("viewAllCategories") : t("viewAll") }} masSecciones={t("moreSections")} />
      </div>
    </section>
  );
}
