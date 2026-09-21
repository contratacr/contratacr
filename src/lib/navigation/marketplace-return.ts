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
 * El rótulo del enlace de salida de una ficha.
 *
 * «Volver» solo se puede decir si de verdad se estuvo antes. Una ficha de
 * promoción o de empleo se comparte por WhatsApp y sale en Google: quien llega
 * así no viene del tablero, y decirle «Volver a promociones» le promete
 * regresar a un sitio donde nunca estuvo —y su botón de atrás se lo lleva
 * FUERA del sitio, que es justo cuando más falta hace una puerta hacia
 * adentro—. Sin origen, el enlace deja de fingir un regreso y ofrece lo que
 * hay: ver la lista entera.
 */
export function marketplaceReturnLabel(
  href: string,
  fallback: "/ofertas" | "/empleos",
  locale: string = "es",
  sinOrigen = false,
) {
  const isEnglish = locale === "en";
  if (sinOrigen) {
    if (fallback === "/ofertas") return isEnglish ? "See all promotions" : "Ver todas las promociones";
    return isEnglish ? "See all jobs" : "Ver todos los empleos";
  }
  const pathname = withoutLocale(href.split(/[?#]/u)[0] || "/");
  if (pathname.startsWith("/profesionales/")) return isEnglish ? "Back to profile" : "Volver al perfil";
  if (pathname.startsWith("/dashboard/")) {
    const params = new URLSearchParams(href.includes("?") ? href.split("?")[1]?.split("#")[0] : "");
    if (params.get("tab") === "saved") return isEnglish ? "Back to favorites" : "Volver a favoritos";
    return isEnglish ? "Back to dashboard" : "Volver al panel";
  }
  if (fallback === "/ofertas") return isEnglish ? "Back to promotions" : "Volver a promociones";
  return isEnglish ? "Back to jobs" : "Volver a empleos";
}
