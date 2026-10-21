export function mobileDownloadPlatform(userAgent: string, touchPoints = 0): "ios" | "android" | null {
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1)) return "ios";
  return null;
}
export const DOWNLOAD_DISMISS_COOKIE = "ccr_download_dismissed_until_v2";
