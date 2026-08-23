"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureAttribution } from "@/lib/analytics/attribution";

// Records the first-touch attribution (utm_*, click ids, referrer) as soon as
// any page renders. Re-runs on client-side navigations so a utm link that
// lands mid-session still gets captured. First-party, no third-party script.
export function AttributionCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    captureAttribution();
  }, [pathname, searchParams]);
  return null;
}
