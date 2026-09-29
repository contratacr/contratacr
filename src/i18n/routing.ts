import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["es", "en"],
  defaultLocale: "es",
  // El español —el idioma del país— va SIN prefijo: contratacr.com/buscar. Solo
  // el inglés lleva /en. Las direcciones viejas con /es/ saltan con 308 desde el
  // middleware, así Google traslada lo ganado en vez de ver dos páginas.
  localePrefix: "as-needed",
  localeDetection: false,
  // next-intl NO toca la cookie NEXT_LOCALE: la escribe solo nuestro middleware
  // (y el botón de idioma). Con la cookie a cargo de next-intl, su router la
  // "sincronizaba" en cada `router.prefetch(..., { locale })`: el selector de
  // idioma precarga el OTRO idioma para que el cambio sea instantáneo, y esa
  // precarga dejaba la cookie en español mientras se leía en inglés. Después,
  // cualquier entrada sin prefijo (/o/, /e/, enlaces cortos) abría en español
  // sola: el "idioma que se cambia por sí solo".
  localeCookie: false,
});
