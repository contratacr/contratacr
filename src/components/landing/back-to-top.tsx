"use client";

import { useState, useEffect } from "react";
import { ChevronUp } from "lucide-react";
import { usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";

export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "";
  const hasAppSurfacePath = (value: string) => /(^|\/)(dashboard|admin|buscar)(\/|$)/.test(value);
  const isAppSurface = hasAppSurfacePath(pathname) || hasAppSurfacePath(redirect);

  useEffect(() => {
    if (isAppSurface) {
      queueMicrotask(() => setVisible(false));
      return;
    }
    const handler = () => setVisible(window.scrollY > 400);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [isAppSurface]);

  if (isAppSurface) return null;

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <button
      onClick={scrollToTop}
      aria-label="Volver al inicio"
      style={{
        position: "fixed",
        bottom: 32,
        right: 32,
        zIndex: 999,
        width: 48,
        height: 48,
        borderRadius: "50%",
        background: "#009FD9",
        color: "#fff",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 12px rgba(0,159,217,0.35)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.3s ease",
      }}
    >
      <ChevronUp className="h-5 w-5" />
    </button>
  );
}
