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

export function marketplaceReturnLabel(
  href: string,
  fallback: "/ofertas" | "/empleos",
  locale: string = "es",
) {
  const isEnglish = locale === "en";
  const pathname = withoutLocale(href.split(/[?#]/u)[0] || "/");
  if (pathname.startsWith("/profesionales/")) return isEnglish ? "Back to profile" : "Volver al perfil";
  if (pathname.startsWith("/dashboard/")) return isEnglish ? "Back to dashboard" : "Volver al panel";
  if (fallback === "/ofertas") return isEnglish ? "Back to offers" : "Volver a ofertas";
  return isEnglish ? "Back to jobs" : "Volver a empleos";
}
