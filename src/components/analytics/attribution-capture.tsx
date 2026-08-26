"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureAttribution, readAttribution } from "@/lib/analytics/attribution";
import { useAuth } from "@/hooks/use-auth";

const CLAIMED_KEY = "contratacr:attribution-claimed";

// Records the first-touch attribution (utm_*, click ids, referrer) as soon as
// any page renders, and — once the visitor is signed in — hands it to the
// server so accounts created outside /api/register/* (Google/Apple sign-in,
// onboarding, native app) are attributed too. First-party, no third-party script.
export function AttributionCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const claiming = useRef(false);

  useEffect(() => {
    captureAttribution();
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!user || claiming.current) return;
    try {
      if (window.sessionStorage.getItem(CLAIMED_KEY) === user.id) return;
    } catch { /* storage unavailable */ }
    const attribution = readAttribution();
    if (!attribution) return;
    claiming.current = true;
    fetch("/api/attribution/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attribution }),
      keepalive: true,
    })
      .then(() => { try { window.sessionStorage.setItem(CLAIMED_KEY, user.id); } catch { /* ignore */ } })
      .catch(() => { /* best-effort */ })
      .finally(() => { claiming.current = false; });
  }, [user]);

  return null;
}
