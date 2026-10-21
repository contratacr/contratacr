export const ANDROID_HOME_ENTRY_PARAM = "_ccr_home";
export const APP_ENTRY_PARAM = "_ccr_open";

export function hasAuthLinkPayload(url: URL): boolean {
  const fragment = new URLSearchParams(url.hash.slice(1));
  return ["code", "access_token", "refresh_token", "token", "token_hash", "id_token", "provider_token", "provider_refresh_token"].some(key => url.searchParams.has(key) || fragment.has(key));
}

/** Only application screens may be opened by external campaign links. */
export function campaignAppPath(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !["contratacr.com", "www.contratacr.com"].includes(url.hostname) || url.port || url.username || url.password) return null;
    const path = url.pathname.replace(/^\/(es|en)(?=\/|$)/, "") || "/";
    if (path === "/" && hasAuthLinkPayload(url)) return null;
    // The secure OAuth sheet consumes this return before session exchange.
    if (path === "/dashboard/native-auth-return") return null;
    if (path !== "/" && !/^\/(?:dashboard(?:\/|$)|continuar-perfil\/?$|buscar(?:\/|$)|servicios(?:\/|$)|profesionales(?:\/|$)|proyectos(?:\/|$)|empleos(?:\/|$)|promociones(?:\/|$)|publicar-proyecto\/?$|api\/trabajos\/reportar\/?$)/.test(path)) return null;
    // Compatibility entry for the published Android binary, whose intent filter
    // does not include home. This marker may only target a locale's own home.
    if (url.searchParams.get(ANDROID_HOME_ENTRY_PARAM) === "1" && path === "/profesionales") {
      if (hasAuthLinkPayload(url)) return null;
      const locale = url.pathname.match(/^\/(es|en)(?:\/|$)/)?.[1];
      url.pathname = locale ? `/${locale}` : "/";
    }
    url.searchParams.delete(ANDROID_HOME_ENTRY_PARAM);
    // The browser-only store fallback must never follow the link into the app.
    url.searchParams.delete(APP_ENTRY_PARAM);
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}
