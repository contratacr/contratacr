"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recoverBodyScrollLock } from "@/lib/body-scroll-lock";

/**
 * Client-side navigation keeps the browser document alive, so an old page's
 * scroll position (or a stale modal body lock) can otherwise leak into the
 * next section. Query-only search changes are reset by their own scrollable
 * result surface; this handles real route/section changes app-wide.
 */
export function RouteScrollReset() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.location.hash) return;
    const frame = window.requestAnimationFrame(() => {
      recoverBodyScrollLock();
      document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
