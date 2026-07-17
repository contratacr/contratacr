"use client";

import { useEffect } from "react";

// Keeps CSS aware of the *visual* viewport. Mobile browsers can leave the layout
// viewport unchanged while the keyboard covers the screen, so fixed sheets that
// only use 100vh can end up behind the keyboard. These variables let shared
// modal/dropdown CSS size against the actually visible area without disabling
// user zoom.
export function ViewportEnvironment() {
  useEffect(() => {
    const root = document.documentElement;

    const update = () => {
      const vv = window.visualViewport;
      const height = vv?.height ?? window.innerHeight;
      const width = vv?.width ?? window.innerWidth;
      const top = vv?.offsetTop ?? 0;
      const left = vv?.offsetLeft ?? 0;
      const scale = vv?.scale ?? 1;
      const keyboardInset = Math.max(0, window.innerHeight - height - top);

      root.style.setProperty("--app-visual-viewport-height", `${height}px`);
      root.style.setProperty("--app-visual-viewport-width", `${width}px`);
      root.style.setProperty("--app-visual-viewport-top", `${top}px`);
      root.style.setProperty("--app-visual-viewport-left", `${left}px`);
      root.style.setProperty("--app-visual-viewport-center-y", `${top + height / 2}px`);
      root.style.setProperty("--app-visual-viewport-scale", `${scale}`);
      root.style.setProperty("--app-keyboard-inset-bottom", `${keyboardInset}px`);
      root.toggleAttribute("data-keyboard-open", keyboardInset > 80);
    };

    update();
    const vv = window.visualViewport;
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    vv?.addEventListener("resize", update);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      vv?.removeEventListener("resize", update);
    };
  }, []);

  return null;
}
