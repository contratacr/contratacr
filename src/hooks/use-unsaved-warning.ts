"use client";

import { useEffect } from "react";

// Warns the user before they leave with unsaved edits — covers BOTH a hard
// unload (tab close / refresh) and in-app navigations (clicking a link or any
// element inside a link). App Router has no built-in route-abort API, so we
// intercept link clicks in the capture phase and confirm before letting them go.
export function useUnsavedWarning(dirty: boolean, message = "Tienes cambios sin guardar. ¿Quieres salir sin guardar?") {
  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }

    function onClickCapture(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;
      // Same-URL clicks aren't a navigation.
      try {
        const dest = new URL(anchor.href, window.location.href);
        if (dest.pathname === window.location.pathname && dest.search === window.location.search) return;
      } catch {
        return;
      }
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [dirty, message]);
}
