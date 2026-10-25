import policy from "./app-link-policy.json";

export const ANDROID_HOME_ENTRY_PARAM = "_ccr_home";
export const APP_ENTRY_PARAM = "_ccr_open";

export function hasAuthLinkPayload(url: URL): boolean {
  const fragment = new URLSearchParams(url.hash.slice(1));
  return policy.authParameters.some(key => url.searchParams.has(key) || fragment.has(key));
}

/** Only application screens may be opened by external campaign links. */
export function campaignAppPath(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !["contratacr.com", "www.contratacr.com"].includes(url.hostname) || url.port || url.username || url.password) return null;
    if (hasAuthLinkPayload(url) || /%2f|%5c|%2e|%00/i.test(url.pathname)) return null;
    const locale = url.pathname.match(/^\/(es|en)(?:\/|$)/)?.[1];
    const prefix = ({ en: "/en", es: "" } as Record<string, string>)[locale ?? "es"];
    const path = url.pathname.replace(/^\/(es|en)(?=\/|$)/, "") || "/";
    const root = path.split("/")[1];
    if (path === "/dashboard/native-auth-return" || path.startsWith("/dashboard/native-auth-return/")) return null;
    const short = /^\/([poec])\/([a-z0-9][a-z0-9-]{3,80})\/?$/i.exec(path);
    const vanity = policy.vanitySources[root as keyof typeof policy.vanitySources];
    if (short) {
      url.pathname = `${prefix}/${policy.shortDetails[short[1].toLowerCase() as keyof typeof policy.shortDetails]}/${short[2].toLowerCase()}`;
    } else if (vanity && /^\/[a-z]+\/?$/.test(path)) {
      url.pathname = prefix || "/";
      if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", vanity);
      if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", root === "wa" ? "referral" : "organic");
      if (!url.searchParams.has("utm_campaign")) url.searchParams.set("utm_campaign", "bio");
    } else if (path === "/pro" || path === "/pro/") {
      url.pathname = `${prefix}/registro/profesional`;
      if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", "whatsapp");
      if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", "outreach");
      if (!url.searchParams.has("utm_campaign")) url.searchParams.set("utm_campaign", "pro-invitacion");
    } else if (path === "/api/trabajos/reportar" || path === "/api/trabajos/reportar/") {
      // A signed, read-only confirmation page; it never submits automatically.
    } else if (policy.browserRoots.includes(root)) {
      return null;
    } else if (policy.sectionRoots.includes(root) || (policy.screenRoots.includes(root) && /^\/[^/]+\/?$/.test(path)) || path === "/") {
      // Existing application route. Authentication is enforced by the destination.
    } else if (/^\/@?[a-z0-9][a-z0-9-]{2,80}\/?$/i.test(path)
      && ![...policy.screenRoots, ...Object.keys(policy.shortDetails)].includes(root)) {
      url.pathname = `${prefix}/profesionales/${path.replace(/^\/@?/, "").replace(/\/$/, "").toLowerCase()}`;
    } else return null;
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
