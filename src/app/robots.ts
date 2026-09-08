import type { MetadataRoute } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/es/admin", "/en/admin", "/es/dashboard", "/en/dashboard", "/es/mensajes", "/en/mensajes", "/es/notificaciones", "/en/notificaciones"] },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
