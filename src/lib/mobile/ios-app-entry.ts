import { APP_STORES } from "@/lib/app-stores";
import { APP_ENTRY_PARAM } from "./campaign-app-link";
import { smartAppBannerContent } from "./smart-app-banner";

/** A real tap changes host so Safari can hand the public URL to the app.
 * If iOS keeps it on the web, middleware serves the fixed App Store fallback.
 * No installation probing, custom schemes, timers, or arbitrary redirects.
 */
export function iosAppEntry(path: string, sourceHostname: string): string | null {
  if (path.length > 4096 || !smartAppBannerContent(path)) return null;
  const target = new URL(path, "https://contratacr.com");
  target.hostname = sourceHostname.toLowerCase() === "www.contratacr.com" ? "contratacr.com" : "www.contratacr.com";
  target.searchParams.delete("_rsc");
  target.searchParams.set(APP_ENTRY_PARAM, "ios");
  return target.href;
}

/** Receiving the marked web request means the OS did not take the link.
 * It does NOT prove the app is absent: a user can prefer opening web links.
 */
export function iosAppStoreFallback(url: URL, userAgent: string): string | null {
  if (url.searchParams.get(APP_ENTRY_PARAM) !== "ios") return null;
  if (!/iPhone|iPad|iPod|Macintosh.*Mobile/i.test(userAgent)) return null;
  if (!smartAppBannerContent(url.pathname + url.search + url.hash)) return null;
  return APP_STORES.ios;
}
