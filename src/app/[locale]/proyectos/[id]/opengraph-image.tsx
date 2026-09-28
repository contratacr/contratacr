import { OG_TAMANO, OG_TIPO, tarjetaDeFicha } from "@/lib/seo/tarjeta-de-ficha";
import { cargarProyectosPublicos } from "@/lib/queries/proyectos-publicos";
import { idCoincide } from "@/lib/marketplace-url";
import { getCategoryLabel } from "@/lib/data/categories";
import { getCantonById, getProvinceById, nombreDeLugar } from "@/lib/data/cr-geography";
import { getTranslations } from "next-intl/server";

export const size = OG_TAMANO;
export const contentType = OG_TIPO;
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "tarjetaSocial" });
  const proyectos = await cargarProyectosPublicos();
  const proyecto = proyectos.find((p) => idCoincide(p.id, id));
  const categoria = proyecto?.category_id ? getCategoryLabel(proyecto.category_id, locale) : "";
  const lugar = nombreDeLugar(proyecto?.canton_id ? getCantonById(proyecto.canton_id) : undefined, proyecto?.provincia_id ? getProvinceById(proyecto.provincia_id) : undefined);
  return tarjetaDeFicha({
    pie: t("pie"),
    etiqueta: t("proyecto"),
    titulo: proyecto?.title ?? t("proyectoSinTitulo"),
    detalle: [categoria, lugar].filter(Boolean).join(" · "),
  });
}
