"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recoverBodyScrollLock } from "@/lib/body-scroll-lock";
import { irAlInicio } from "@/lib/ir-al-inicio";

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
      irAlInicio();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
