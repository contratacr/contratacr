import { APP_STORES } from "@/lib/app-stores";
import { smartAppBannerContent } from "./smart-app-banner";

export const ANDROID_APP_ID = "com.contratacr.app";
export type RelatedApp = { platform?: string; id?: string };

export function isInstalledAndroidApp(apps: RelatedApp[]): boolean {
  return apps.some(app => app.platform === "play" && app.id === ANDROID_APP_ID);
}

/** A tap opens the current public screen; Chrome handles the store fallback.
 * Never probe custom schemes or redirect people away from the website on load.
 */
export function androidAppIntent(path: string): string | null {
  if (!smartAppBannerContent(path)) return null;
  const url = new URL(path, "https://contratacr.com");
  if (url.searchParams.has("_rsc")) url.searchParams.delete("_rsc");
  // Android intent extras are separated by semicolons. Encode user-controlled
  // delimiters before placing a public URL into that grammar.
  const destination = `${url.pathname}${url.search}${url.hash}`.replaceAll(";", "%3B");
  return `intent://contratacr.com${destination}#Intent;scheme=https;package=${ANDROID_APP_ID};S.browser_fallback_url=${encodeURIComponent(APP_STORES.android)};end`;
}
