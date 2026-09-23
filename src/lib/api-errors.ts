import type { NextRequest } from "next/server";

export type IdiomaApi = "es" | "en";

/**
 * El idioma de quien está pidiendo, visto desde una ruta de API.
 *
 * Las rutas NO reciben el locale: el middleware se sale antes para `/api/`
 * (`src/middleware.ts`), así que la cabecera `x-ccr-locale` que pone para las
 * páginas nunca les llega. Se deduce, en orden de confianza:
 *
 *  1. lo que mande el propio cuerpo o la query (quien lo manda, lo sabe);
 *  2. la cookie `NEXT_LOCALE`, que es la elección de la persona;
 *  3. el `Referer`, que trae el prefijo de la pantalla desde la que llamó;
 *  4. `Accept-Language`, y si no, español.
 */
export function idiomaDeLaPeticion(req: NextRequest | Request, declarado?: string | null): IdiomaApi {
  if (declarado === "en" || declarado === "es") return declarado;

  const cookie = "cookies" in req && typeof (req as NextRequest).cookies?.get === "function"
    ? (req as NextRequest).cookies.get("NEXT_LOCALE")?.value
    : leerCookie(req.headers.get("cookie"), "NEXT_LOCALE");
  if (cookie === "en" || cookie === "es") return cookie;

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const ruta = new URL(referer).pathname;
      if (ruta === "/en" || ruta.startsWith("/en/")) return "en";
      if (ruta === "/es" || ruta.startsWith("/es/")) return "es";
    } catch { /* referer malformado: se ignora */ }
  }

  return pesaMasElIngles(req.headers.get("accept-language")) ? "en" : "es";
}

function leerCookie(crudo: string | null, nombre: string): string | undefined {
  if (!crudo) return undefined;
  for (const parte of crudo.split(";")) {
    const [clave, ...resto] = parte.trim().split("=");
    if (clave === nombre) return resto.join("=");
  }
  return undefined;
}

/**
 * Misma regla que el middleware: solo gana el inglés cuando el navegador lo
 * pide POR ENCIMA del español. Un `es-CR,es;q=0.9,en;q=0.8` sigue siendo
 * español.
 */
function pesaMasElIngles(cabecera: string | null): boolean {
  if (!cabecera) return false;
  let es = 0;
  let en = 0;
  for (const parte of cabecera.split(",")) {
    const [etiqueta, ...resto] = parte.trim().split(";");
    const q = Number.parseFloat(resto.find((r) => r.trim().startsWith("q="))?.split("=")[1] ?? "1");
    const peso = Number.isFinite(q) ? q : 1;
    const base = etiqueta.trim().toLowerCase().split("-")[0];
    if (base === "es") es = Math.max(es, peso);
    if (base === "en") en = Math.max(en, peso);
  }
  return en > es;
}

/**
 * El mensaje de error en el idioma de quien pide.
 *
 * Hasta ahora las rutas devolvían `error: "…"` siempre en español, así que un
 * usuario en inglés que fallaba una reserva, una promoción o una subida de foto
 * recibía el mensaje en español. Hay UN sitio en todo el app que ya lo hacía
 * bien (`/api/contact/whatsapp-link`); esto lo convierte en la forma normal.
 *
 * `code` es lo importante para el front: un mensaje se traduce y se reescribe,
 * un código no. Donde el front necesite DECIDIR algo con el error —y no solo
 * mostrarlo— tiene que mirar el código, nunca el texto.
 */
export function mensajeDeError(
  req: NextRequest | Request,
  textos: { es: string; en: string },
  declarado?: string | null,
): string {
  return textos[idiomaDeLaPeticion(req, declarado)];
}
