const ALLOWED_RETURN_PATHS = [
  "/ofertas",
  "/empleos",
  "/profesionales/",
  "/dashboard/cliente",
  "/dashboard/profesional",
] as const;

function withoutLocale(pathname: string) {
  return pathname.replace(/^\/(?:es|en)(?=\/|$)/u, "") || "/";
}

export function safeMarketplaceReturnHref(
  value: string | null | undefined,
  fallback: "/ofertas" | "/empleos",
) {
  if (!value) return fallback;
  if (value === "panel") {
    return fallback === "/ofertas"
      ? "/dashboard/profesional?mode=offer&tab=offers"
      : "/dashboard/profesional?mode=offer&tab=jobs";
  }

  let href = value;
  try {
    href = decodeURIComponent(value);
  } catch {
    href = value;
  }

  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) {
    return fallback;
  }

  const pathname = withoutLocale(href.split(/[?#]/u)[0] || "/");
  const allowed = ALLOWED_RETURN_PATHS.some((path) =>
    path.endsWith("/") ? pathname.startsWith(path) : pathname === path || pathname.startsWith(`${path}/`),
  );
  return allowed ? href : fallback;
}

/**
 * La CLAVE del rótulo del enlace de salida de una ficha (namespace
 * `marketplaceReturn`). Devuelve la clave y no el texto para que la copia viva
 * en `messages/*.json` como el resto del app; quien la usa la traduce con
 * `useTranslations` o `getTranslations`.
 *
 * «Volver» solo se puede decir si de verdad se estuvo antes. Una ficha de
 * promoción o de empleo se comparte por WhatsApp y sale en Google: quien llega
 * así no viene del tablero, y decirle «Volver a promociones» le promete
 * regresar a un sitio donde nunca estuvo —y su botón de atrás se lo lleva
 * FUERA del sitio, que es justo cuando más falta hace una puerta hacia
 * adentro—. Sin origen, el enlace deja de fingir un regreso y ofrece lo que
 * hay: ver la lista entera.
 */
export function marketplaceReturnLabelKey(
  href: string,
  fallback: "/ofertas" | "/empleos",
  sinOrigen = false,
) {
  if (sinOrigen) return fallback === "/ofertas" ? "allPromotions" : "allJobs";
  const pathname = withoutLocale(href.split(/[?#]/u)[0] || "/");
  if (pathname.startsWith("/profesionales/")) return "backToProfile";
  if (pathname.startsWith("/dashboard/")) {
    const params = new URLSearchParams(href.includes("?") ? href.split("?")[1]?.split("#")[0] : "");
    return params.get("tab") === "saved" ? "backToFavorites" : "backToDashboard";
  }
  return fallback === "/ofertas" ? "backToPromotions" : "backToJobs";
}
