import type { MetadataRoute } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";
// Solo el sitio de producción se deja indexar. En test (u otra copia) los
// buscadores recorrían las 558 direcciones del mapa del sitio, y cada perfil se
// arma consultando la base sin caché: era tráfico de salida constante contra un
// entorno que nadie debe encontrar en Google.
const ES_PRODUCCION = /^https:\/\/(www\.)?contratacr\.com$/.test(APP_URL.replace(/\/$/, ""));

/**
 * Lo que un buscador no tiene nada que hacer visitando.
 *
 * Además del panel y los mensajes, estaban quedando fuera de la lista una
 * docena de pantallas que EXIGEN SESIÓN y que Google rastreaba igual: publicar
 * un empleo, publicar una promoción, «mis empleos», completar el perfil,
 * recuperar la contraseña, reservar… Todas terminan en la pantalla de ingreso,
 * así que lo único que hacían era gastar rastreo. Y el rastreo es justo lo que
 * escasea: mientras se gastaba en estas, las páginas por oficio —que sí traen
 * clientes— seguían sin visitarse.
 *
 * Se listan por prefijo de idioma porque toda dirección pública los lleva.
 */
const EN_LOS_DOS_IDIOMAS = [
  "/admin",
  "/dashboard",
  "/mensajes",
  "/notificaciones",
  "/onboarding",
  "/completar-perfil",
  "/eliminar-cuenta",
  "/olvide-contrasena",
  "/reset-password",
  "/publicar-proyecto",
  "/empleos/publicar",
  "/empleos/mis-empleos",
  "/ofertas/publicar",
  "/ofertas/mis-ofertas",
];

/** La reserva cuelga de cada perfil, así que se nombra con comodín. */
const CON_COMODIN = ["/es/profesionales/*/reservar", "/en/profesionales/*/reservar"];

const CERRADAS = [
  "/api/",
  "/admin",
  ...EN_LOS_DOS_IDIOMAS.flatMap((ruta) => [`/es${ruta}`, `/en${ruta}`]),
  ...CON_COMODIN,
];

export default function robots(): MetadataRoute.Robots {
  if (!ES_PRODUCCION) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: CERRADAS },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
