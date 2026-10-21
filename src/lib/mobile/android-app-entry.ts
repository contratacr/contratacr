import { APP_STORES } from "@/lib/app-stores";
import { ANDROID_HOME_ENTRY_PARAM } from "./campaign-app-link";
import { smartAppBannerContent } from "./smart-app-banner";

export const ANDROID_APP_ID = "com.contratacr.app";
export type RelatedApp = { platform?: string; id?: string };

// Released binaries lack the reverse asset statement required by Chrome.
// An empty result cannot distinguish an absent app from that older installation.
export function isInstalledAndroidApp(apps: RelatedApp[]): true | null {
  return apps.some(app => app.platform === "play" && app.id === ANDROID_APP_ID) ? true : null;
}

/** A tap opens the current public screen; Chrome handles the store fallback.
 * Never probe custom schemes or redirect people away from the website on load.
 */
export function androidAppIntent(path: string): string | null {
  if (!smartAppBannerContent(path)) return null;
  const url = new URL(path, "https://contratacr.com");
  if (url.searchParams.has("_rsc")) url.searchParams.delete("_rsc");
  // Play 1.0.11 only handles path prefixes; it cannot resolve / or /en.
  // Enter through an already supported route and restore home inside the app.
  if (/^\/(?:es\/?|en\/?)?$/.test(url.pathname)) {
    const locale = url.pathname.match(/^\/(es|en)(?:\/|$)/)?.[1];
    url.pathname = `${locale ? `/${locale}` : ""}/profesionales`;
    url.searchParams.set(ANDROID_HOME_ENTRY_PARAM, "1");
  }
  // Android intent extras are separated by semicolons. Encode user-controlled
  // delimiters before placing a public URL into that grammar.
  const destination = `${url.pathname}${url.search}${url.hash}`.replaceAll(";", "%3B");
  return `intent://contratacr.com${destination}#Intent;scheme=https;package=${ANDROID_APP_ID};S.browser_fallback_url=${encodeURIComponent(APP_STORES.android)};end`;
}
