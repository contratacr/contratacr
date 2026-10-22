import { campaignAppPath, hasAuthLinkPayload } from "./campaign-app-link";

// Public app entry never carries login callbacks, admin routes or private tasks.
export function publicAppEntryUrl(path: string): URL | null {
  if (!path.startsWith("/") || path.startsWith("//") || /[\r\n\\]/.test(path)) return null;
  const url = new URL(path, "https://contratacr.com");
  const normalized = url.pathname.replace(/^\/(es|en)(?=\/|$)/, "") || "/";
  if (normalized !== "/" && !/^\/(?:buscar|profesionales|servicios|proyectos|empleos|promociones)(?:\/|$)/.test(normalized)) return null;
  if (/\/(?:publicar|editar|mis-empleos|mis-promociones)(?:\/|$)/.test(normalized)) return null;
  if (hasAuthLinkPayload(url)) return null;
  if (url.searchParams.has("_rsc")) url.searchParams.delete("_rsc");
  if (!campaignAppPath(url.href)) return null;
  return url;
}
