import { APP_STORES } from "@/lib/app-stores";
import { mobileDownloadPlatform } from "@/lib/mobile-download-platform";

export function GET(request: Request) {
  const ua = request.headers.get("user-agent") ?? "";
  // iPad Safari can use a desktop-style Macintosh UA with the Mobile token.
  const hint = (request.headers.get("sec-ch-ua-platform") ?? "").replaceAll('"', "");
  const platform = mobileDownloadPlatform(ua, /Macintosh.*Mobile/i.test(ua) ? 2 : 0)
    ?? (hint === "iOS" ? "ios" : hint === "Android" ? "android" : null);
  const destination = platform ? APP_STORES[platform] : "/#descargar-app";
  // Never cache one person's iPhone choice for a later Android scan.
  return new Response(null, {
    status: 307,
    headers: {
      Location: destination,
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "User-Agent, Sec-CH-UA-Platform",
    },
  });
}
