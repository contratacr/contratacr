const ALLOWED_RETURN_PATHS = [
  "/promociones",
  "/empleos",
  "/profesionales/",
  "/dashboard/cliente",
  "/dashboard/profesional",
  "/proyectos",
] as const;

type Tablero = "/promociones" | "/empleos" | "/proyectos";

const PANEL_POR_TABLERO: Record<Tablero, string> = {
  "/promociones": "/dashboard/profesional?mode=offer&tab=offers",
  "/empleos": "/dashboard/profesional?mode=offer&tab=jobs",
  "/proyectos": "/dashboard/profesional?tab=sent_projects",
};

function withoutLocale(pathname: string) {
  return pathname.replace(/^\/(?:es|en)(?=\/|$)/u, "") || "/";
}

export function safeMarketplaceReturnHref(
  value: string | null | undefined,
  fallback: Tablero,
) {
  if (!value) return fallback;
  // «panel» a secas es la forma vieja: devuelve a la pestaña, sin más. Hoy el
  // panel manda su dirección completa (pestaña y etapa Activos/Inactivos) para
  // que la flecha de atrás deje a la persona EXACTAMENTE donde estaba.
  if (value === "panel") return PANEL_POR_TABLERO[fallback];

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
  fallback: Tablero,
  sinOrigen = false,
) {
  if (sinOrigen) return fallback === "/promociones" ? "allPromotions" : fallback === "/empleos" ? "allJobs" : "allProjects";
  const pathname = withoutLocale(href.split(/[?#]/u)[0] || "/");
  if (pathname.startsWith("/profesionales/")) return "backToProfile";
  if (pathname.startsWith("/dashboard/")) {
    const params = new URLSearchParams(href.includes("?") ? href.split("?")[1]?.split("#")[0] : "");
    return params.get("tab") === "saved" ? "backToFavorites" : "backToDashboard";
  }
  return fallback === "/promociones" ? "backToPromotions" : fallback === "/empleos" ? "backToJobs" : "backToProjects";
}

/** Si la ficha se abrió desde el panel (forma vieja «panel» o dirección completa del panel). */
export function vieneDelPanel(value: string | null | undefined) {
  if (!value) return false;
  if (value === "panel") return true;
  return safeMarketplaceReturnHref(value, "/empleos").startsWith("/dashboard/");
}
