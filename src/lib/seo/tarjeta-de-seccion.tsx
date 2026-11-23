import { getTranslations } from "next-intl/server";
import { OG_TAMANO, OG_TIPO } from "@/lib/seo/tarjeta-de-ficha";
import { tarjetaDeMarca } from "@/lib/seo/tarjeta-de-marca";

export { OG_TAMANO, OG_TIPO };

/**
 * LA TARJETA AL COMPARTIR UNA SECCIÓN (6-oct-2026). Empleos, Promociones,
 * Proyectos, la búsqueda, Publicar proyecto y Cotizar salían con el logo
 * genérico: quien recibía el enlace no sabía qué le mandaban. Lleva el nombre
 * de la sección y una línea que dice qué se hace ahí. Los textos viven en
 * `tarjetaSocial.seccion*`. Desde el 21-nov-2026 usa la tarjeta de marca, que
 * se ve bien tanto ancha (WhatsApp) como recortada al cuadrado (Facebook).
 */
export async function tarjetaDeSeccion(locale: string, clave: "seccionEmpleos" | "seccionPromociones" | "seccionProyectos" | "seccionProfesionales" | "seccionPublicar" | "seccionCotizar") {
  const t = await getTranslations({ locale, namespace: "tarjetaSocial" });
  return tarjetaDeMarca({ etiqueta: t(`${clave}.etiqueta`), titulo: t(`${clave}.titulo`), detalle: t(`${clave}.detalle`) });
}

/** La tarjeta general del sitio: la portada y todas las páginas sin tarjeta propia. */
export async function tarjetaGeneral(locale: string) {
  const t = await getTranslations({ locale, namespace: "tarjetaSocial" });
  return tarjetaDeMarca({ titulo: t("marca.titulo"), detalle: t("marca.detalle") });
}
