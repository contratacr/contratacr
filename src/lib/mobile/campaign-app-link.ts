export function hasAuthLinkPayload(url: URL): boolean {
  const fragment = new URLSearchParams(url.hash.slice(1));
  return ["code", "access_token", "refresh_token", "token", "token_hash", "id_token", "provider_token", "provider_refresh_token"].some(key => url.searchParams.has(key) || fragment.has(key));
}

/** Only application screens may be opened by external campaign links. */
export function campaignAppPath(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "contratacr.com" || url.port || url.username || url.password) return null;
    const path = url.pathname.replace(/^\/(es|en)(?=\/|$)/, "") || "/";
    if (path === "/" && hasAuthLinkPayload(url)) return null;
    // The secure OAuth sheet consumes this return before session exchange.
    if (path === "/dashboard/native-auth-return") return null;
    if (path !== "/" && !/^\/(?:dashboard(?:\/|$)|continuar-perfil\/?$|buscar(?:\/|$)|servicios(?:\/|$)|profesionales(?:\/|$)|proyectos(?:\/|$)|empleos(?:\/|$)|promociones(?:\/|$)|publicar-proyecto\/?$|api\/trabajos\/reportar\/?$)/.test(path)) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}
