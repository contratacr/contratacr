import { imagenSocial } from "@/lib/seo/imagen-social";
import type { Metadata } from "next";

/**
 * La dirección canónica de una pantalla y sus versiones por idioma.
 *
 * Solo la portada declaraba `hreflang`. Sin él, Google trata /es y /en como dos
 * páginas que compiten entre sí en vez de como la misma en dos idiomas, y elige
 * una por su cuenta.
 *
 * `ruta` va SIN el prefijo de idioma y empezando por barra: "/ayuda", "" para
 * la portada.
 */
export function alternativasDeIdioma(locale: string, ruta: string): Metadata["alternates"] {
  const limpia = ruta === "/" ? "" : ruta;
  return {
    canonical: `/${locale}${limpia}`,
    languages: {
      es: `/es${limpia}`,
      en: `/en${limpia}`,
      "x-default": `/es${limpia}`,
    },
  };
}

/** Los metadatos completos de una pantalla pública: título, resumen, dirección y tarjeta al compartir. */
export function metadatosDePantalla({
  locale,
  ruta,
  titulo,
  descripcion,
}: {
  locale: string;
  ruta: string;
  titulo: string;
  descripcion: string;
}): Metadata {
  const alternates = alternativasDeIdioma(locale, ruta);
  const url = `/${locale}${ruta === "/" ? "" : ruta}`;
  // Con su imagen: estos dos objetos REEMPLAZAN a los del layout, no se mezclan.
  const social = imagenSocial(locale);
  return {
    title: titulo,
    description: descripcion,
    alternates,
    openGraph: { title: titulo, description: descripcion, url, type: "website", siteName: "ContrataCR", ...social.openGraph },
    twitter: { title: titulo, description: descripcion, ...social.twitter },
  };
}
