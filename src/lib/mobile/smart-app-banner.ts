import { mobileDownloadPlatform } from "@/lib/mobile-download-platform";
import { publicAppEntryUrl } from "./public-app-entry";

export const IOS_APP_STORE_ID = "6794559661";

export function prefersNativeIosAppBanner(userAgent: string, touchPoints = 0): boolean {
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && (/Mobile/i.test(userAgent) || touchPoints > 1));
  return ios && /Version\/[\d.]+.*Safari\//i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBIOS|Instagram|GSA\/|MicroMessenger|Line\/|DuckDuckGo\/|YaBrowser\/|Brave\/|OPT\//i.test(userAgent);
}

/** One owner per surface; installed-app detection never chooses a second banner. */
export function appBannerPresentation(userAgent: string, touchPoints = 0, standalone = false, native = false): "apple" | "web" | "none" {
  if (native || !mobileDownloadPlatform(userAgent, touchPoints)) return "none";
  return !standalone && prefersNativeIosAppBanner(userAgent, touchPoints) ? "apple" : "web";
}

// Only public, supported app screens get a banner. Never put login callbacks,
// admin URLs or private tasks into Apple's app-argument metadata.
export function smartAppBannerContent(path: string): string | null {
  const url = publicAppEntryUrl(path);
  return url ? `app-id=${IOS_APP_STORE_ID}, app-argument=${url.href.replaceAll(",", "%2C")}` : null;
}
