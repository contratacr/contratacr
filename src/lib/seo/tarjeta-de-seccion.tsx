import { getTranslations } from "next-intl/server";
import { OG_TAMANO, OG_TIPO, tarjetaDeFicha } from "@/lib/seo/tarjeta-de-ficha";

export { OG_TAMANO, OG_TIPO };

/**
 * LA TARJETA AL COMPARTIR UNA SECCIÓN (6-oct-2026). Empleos, Promociones,
 * Proyectos, la búsqueda, Publicar proyecto y Cotizar salían con el logo
 * genérico: quien recibía el enlace no sabía qué le mandaban. Misma tarjeta
 * azul que las fichas, con el nombre de la sección y una línea que dice qué
 * se hace ahí. Los textos viven en `tarjetaSocial.seccion*`.
 */
export async function tarjetaDeSeccion(locale: string, clave: "seccionEmpleos" | "seccionPromociones" | "seccionProyectos" | "seccionProfesionales" | "seccionPublicar" | "seccionCotizar") {
  const t = await getTranslations({ locale, namespace: "tarjetaSocial" });
  return tarjetaDeFicha({ etiqueta: t(`${clave}.etiqueta`), titulo: t(`${clave}.titulo`), detalle: t(`${clave}.detalle`), pie: t("pie") });
}
