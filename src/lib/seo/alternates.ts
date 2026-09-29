import { imagenSocial } from "@/lib/seo/imagen-social";
import type { Metadata } from "next";
import { rutaConIdioma } from "@/lib/prefijo-de-idioma";

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
  // Español sin prefijo (es la canónica y la x-default); inglés con /en.
  return {
    canonical: rutaConIdioma(locale, limpia || "/"),
    languages: {
      es: rutaConIdioma("es", limpia || "/"),
      en: rutaConIdioma("en", limpia || "/"),
      "x-default": rutaConIdioma("es", limpia || "/"),
    },
  };
}

/** Los metadatos completos de una pantalla pública: título, resumen, dirección y tarjeta al compartir. */
export function metadatosDePantalla({
  locale,
  ruta,
  titulo,
  descripcion,
  tarjetaPropia = false,
}: {
  locale: string;
  ruta: string;
  titulo: string;
  descripcion: string;
  /**
   * La pantalla dibuja su propia tarjeta (tiene `opengraph-image.tsx` al
   * lado). Si aquí se pusiera la genérica, ganaría la genérica: `openGraph`
   * explícito manda sobre el archivo. Con esto se deja el hueco para que Next
   * enchufe la de la pantalla.
   */
  tarjetaPropia?: boolean;
}): Metadata {
  const alternates = alternativasDeIdioma(locale, ruta);
  const url = rutaConIdioma(locale, ruta || "/");
  // Con su imagen: estos dos objetos REEMPLAZAN a los del layout, no se mezclan.
  const social = tarjetaPropia ? { openGraph: {}, twitter: { card: "summary_large_image" as const } } : imagenSocial(locale);
  return {
    title: titulo,
    description: descripcion,
    alternates,
    openGraph: { title: titulo, description: descripcion, url, type: "website", siteName: "ContrataCR", ...social.openGraph },
    twitter: { title: titulo, description: descripcion, ...social.twitter },
  };
}
