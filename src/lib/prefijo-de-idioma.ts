/**
 * El español vive en la raíz —contratacr.com/buscar— y solo el inglés lleva
 * prefijo —contratacr.com/en/buscar—. Todo lo que arma una dirección a mano
 * (correos, avisos, push, redirecciones, metadatos) pasa por aquí, así que la
 * regla existe en un solo lugar.
 */
export type Idioma = "es" | "en";

/** "" para español, "/en" para inglés. */
export function prefijoDeIdioma(locale: string | null | undefined): "" | "/en" {
  return locale === "en" ? "/en" : "";
}

/** rutaConIdioma("es", "/buscar") → "/buscar"; rutaConIdioma("en", "/buscar") → "/en/buscar"; rutaConIdioma("es", "/") → "/". */
export function rutaConIdioma(locale: string | null | undefined, ruta: string): string {
  const limpia = ruta.startsWith("/") ? ruta : `/${ruta}`;
  const prefijo = prefijoDeIdioma(locale);
  if (limpia === "/" || limpia === "") return prefijo || "/";
  return `${prefijo}${limpia}`;
}

/** Quita el prefijo de idioma, venga o no: "/en/buscar" y "/es/buscar" → "/buscar". */
export function sinPrefijoDeIdioma(ruta: string): string {
  return ruta.replace(/^\/(?:es|en)(?=\/|$)/, "") || "/";
}

/** Idioma que se lee en una ruta: solo "/en" y "/en/..." son inglés. */
export function idiomaDeRuta(ruta: string): Idioma {
  return /^\/en(?:\/|$)/.test(ruta) ? "en" : "es";
}

/**
 * Rutas que hay que invalidar en caché para una pantalla: la pública (sin
 * prefijo en español) y la interna de Next (/es/…, que es como la ruta
 * [locale] la conoce por dentro). Para inglés son la misma.
 */
export function rutasDeCache(locale: string | null | undefined, ruta: string): string[] {
  const publica = rutaConIdioma(locale, ruta);
  const interna = `/${locale === "en" ? "en" : "es"}${ruta === "/" ? "" : ruta}`;
  return publica === interna ? [publica] : [publica, interna];
}
