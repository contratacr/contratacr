/** Only application screens may be opened by external campaign links. */
export function campaignAppPath(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "contratacr.com" || url.port || url.username || url.password) return null;
    const path = url.pathname.replace(/^\/(es|en)(?=\/)/, "");
    if (!/^\/(?:dashboard(?:\/|$)|continuar-perfil\/?$|buscar(?:\/|$)|servicios(?:\/|$)|profesionales(?:\/|$)|proyectos(?:\/|$)|empleos(?:\/|$)|promociones(?:\/|$)|publicar-proyecto\/?$|api\/trabajos\/reportar\/?$)/.test(path)) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}
