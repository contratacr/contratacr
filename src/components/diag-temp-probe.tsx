"use client";

import { useEffect } from "react";

// Temporal: mide el tiquete de soporte con el teclado. Borrar al terminar.
export function DiagTempProbe() {
  useEffect(() => {
    if (new URLSearchParams(location.search).get("ccrprobe") !== "soporte") return;
    const r = (sel: string) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return [Math.round(b.top), Math.round(b.bottom)];
    };
    const enviar = (motivo: string) => {
      const vv = window.visualViewport;
      void fetch("/api/diag-temp", {
        method: "POST",
        body: JSON.stringify({
          motivo,
          teclado: document.documentElement.hasAttribute("data-keyboard-open"),
          claseHilo: document.documentElement.classList.contains("contratacr-chat-thread-open") || document.body.classList.contains("contratacr-chat-thread-open"),
          vv: vv ? Math.round(vv.height) : null,
          vvTop: vv ? Math.round(vv.offsetTop) : null,
          varTop: getComputedStyle(document.documentElement).getPropertyValue("--app-visual-viewport-top").trim(),
          hilo: r(".ccr-support-thread"),
          tarjeta: r(".ccr-support-thread-card"),
          compositor: r(".ccr-support-thread-composer"),
        }),
      }).catch(() => {});
    };
    window.setTimeout(() => enviar("inicio"), 3000);
    window.visualViewport?.addEventListener("resize", () => window.setTimeout(() => enviar("resize"), 500));
    document.addEventListener("focusin", () => window.setTimeout(() => enviar("foco"), 1000));
  }, []);
  return null;
}
