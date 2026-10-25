"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useNativeApp } from "@/hooks/use-native-app";
import { campaignAppPath } from "@/lib/mobile/campaign-app-link";

/** Client navigation keeps the listener alive when a second app link arrives
 * during a route change; a full document reload can lose that native event. */
export function CampaignAppLinks() {
  const native = useNativeApp();
  const router = useRouter();
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    let remove: (() => Promise<void>) | undefined;
    const navigate = ({ url }: { url: string }) => {
      const path = campaignAppPath(url);
      if (!disposed && path && path !== location.pathname + location.search + location.hash) router.push(path);
    };
    void import("@capacitor/app").then(async ({ App }) => {
      const listener = await App.addListener("appUrlOpen", navigate);
      if (disposed) { await listener.remove(); return; }
      remove = () => listener.remove();
      // One cold-launch replay per WebView session; never store signed URLs.
      const replayed = sessionStorage.getItem("ccr:campaign-launch-consumed:v1");
      if (!replayed) {
        sessionStorage.setItem("ccr:campaign-launch-consumed:v1", "1");
        const launch = await App.getLaunchUrl();
        if (launch) navigate(launch);
      }
    }).catch(() => { /* Older binaries continue to use ordinary web links. */ });
    return () => { disposed = true; void remove?.(); };
  }, [native, router]);
  return null;
}
