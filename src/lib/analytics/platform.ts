export type AnalyticsRuntime = "web" | "web_desktop" | "web_mobile" | "android" | "ios" | "native_unknown";
export function analyticsPlatform(read: (name: string) => string | undefined | null) {
  const native = read("ccr_platform") === "native";
  const os = read("ccr_native_os");
  const device = read("ccr_web_device");
  const web = device === "desktop" ? "web_desktop" : device === "mobile" ? "web_mobile" : "web";
  const runtime: AnalyticsRuntime = native ? os === "android" || os === "ios" ? os : "native_unknown" : web;
  return { platform: native ? "native" : "web", runtime };
}
export function requestAnalyticsPlatform(req: Request) {
  const jar = new Map((req.headers.get("cookie") ?? "").split(";").map(value => {
    const [key, ...rest] = value.trim().split("=");
    return [key, rest.join("=")];
  }));
  return analyticsPlatform(name => jar.get(name));
}

/** Device family, never viewport width: resizing a window must not change its segment.
 * iPadOS uses a Mac user agent, so touch capability disambiguates it on the client.
 * Missing/unrecognised signals stay unclassified instead of inventing desktop visits.
 */
export function webDeviceCategory(userAgent: string, maxTouchPoints = 0): "mobile" | "desktop" | "unknown" {
  if (/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(userAgent) || (/Macintosh|MacIntel/i.test(userAgent) && maxTouchPoints > 1)) return "mobile";
  if (/Windows NT|Macintosh|X11|CrOS/i.test(userAgent)) return "desktop";
  return "unknown";
}
export function isNativeAnalyticsRuntime(runtime: string) {
  return runtime === "android" || runtime === "ios" || runtime === "native_unknown";
}
