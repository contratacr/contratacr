import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ServiciosPorSeccion, type SeccionDeServicios } from "@/components/landing/servicios-por-seccion";
import { DEMANDA_DE_SERVICIOS } from "@/lib/data/home-categories";
import { CATEGORY_GROUPS, CATEGORY_GROUP_LABELS_EN, getCategoryLabel } from "@/lib/data/categories";
import { categoryGroupId, categoryImageUrl } from "@/lib/data/category-images";
import { getSupplyCounts } from "@/lib/queries/supply";
import { rutaDeBusqueda } from "@/lib/buscar-url";

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

  const porSeccion = new Map<string, string[]>();
  for (const [id, cuantos] of Object.entries(supply.byCategory)) {
    if ((cuantos ?? 0) < 2 || !categoryImageUrl(id)) continue;
    const grupo = categoryGroupId(id);
    if (!grupo) continue;
    porSeccion.set(grupo, [...(porSeccion.get(grupo) ?? []), id]);
  }

  const secciones: SeccionDeServicios[] = CATEGORY_GROUPS
    .map((g) => ({ g, ids: (porSeccion.get(g.id) ?? []).sort((a, b) => orden(a) - orden(b)) }))
    .filter(({ ids }) => ids.length >= 2)
    .sort((a, b) => orden(a.ids[0]) - orden(b.ids[0]))
    .slice(0, 9)
    .map(({ g, ids }) => ({
      id: g.id,
      label: locale === "en" ? (CATEGORY_GROUP_LABELS_EN[g.id] ?? g.label) : g.label,
      servicios: ids.map((id) => ({ id, label: getCategoryLabel(id, locale), href: rutaDeBusqueda({ categoria: id }) })),
    }));

  return (
    <section className="ccr-home-services-section bg-[#f4f7fa] pb-8 pt-8 sm:py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-[1.9rem] font-extrabold leading-tight text-[#1a2744] sm:mb-8 sm:text-center sm:text-4xl">
          {t("titlePre")} <span className="text-[#009FD9]">{t("titleHighlight")}</span>
        </h2>
        <ServiciosPorSeccion secciones={secciones} />
        <div className="mt-8 text-center">
          <Link href="/servicios" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#009FD9] hover:underline">
            {t("viewAll")}
          </Link>
        </div>
      </div>
    </section>
  );
}
