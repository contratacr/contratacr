import type { MetadataRoute } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";
// Solo el sitio de producción se deja indexar. En test (u otra copia) los
// buscadores recorrían las 558 direcciones del mapa del sitio, y cada perfil se
// arma consultando la base sin caché: era tráfico de salida constante contra un
// entorno que nadie debe encontrar en Google.
const ES_PRODUCCION = /^https:\/\/(www\.)?contratacr\.com$/.test(APP_URL.replace(/\/$/, ""));

export default function robots(): MetadataRoute.Robots {
  if (!ES_PRODUCCION) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/es/admin", "/en/admin", "/es/dashboard", "/en/dashboard", "/es/mensajes", "/en/mensajes", "/es/notificaciones", "/en/notificaciones"] },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
