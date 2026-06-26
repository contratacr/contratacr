"use client";

import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export function BackToTop() {
  const t = useTranslations("common");
  const [state, setState] = useState({ visible: false, progress: 0 });
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "";
  const hasAppSurfacePath = (value: string) => /(^|\/)(dashboard|admin|buscar)(\/|$)/.test(value);
  const isAppSurface = hasAppSurfacePath(pathname) || hasAppSurfacePath(redirect);

  useEffect(() => {
    if (isAppSurface) {
      queueMicrotask(() => setState({ visible: false, progress: 0 }));
      return;
    }

    let frame = 0;
    const handler = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
        const progress = Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
        const visible = window.scrollY > Math.min(640, window.innerHeight * 0.8) && progress > 0.18;
        setState((current) => {
          const nextProgress = Math.round(progress * 100);
          const currentProgress = Math.round(current.progress * 100);
          if (current.visible === visible && currentProgress === nextProgress) return current;
          return { visible, progress };
        });
      });
    };

    handler();
    window.addEventListener("scroll", handler, { passive: true });
    window.addEventListener("resize", handler);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", handler);
      window.removeEventListener("resize", handler);
    };
  }, [isAppSurface]);

  if (isAppSurface) return null;

  function scrollToTop() {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label={t("backToTop")}
      title={t("backToTop")}
      className={cn(
        "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-[60] grid h-12 w-12 place-items-center rounded-full p-[2px] text-[#162543] shadow-lg shadow-[#162543]/15 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9] focus-visible:ring-offset-2 active:translate-y-0 sm:bottom-6 sm:right-6 sm:h-12 sm:w-12",
        state.visible ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-3 scale-95 opacity-0",
      )}
      style={{
        background: `conic-gradient(#009FD9 ${Math.round(state.progress * 360)}deg, rgba(255,255,255,0.72) 0deg)`,
      }}
    >
      <span className="grid h-full w-full place-items-center rounded-full border border-white/80 bg-white/95 backdrop-blur">
        <ArrowUp className="h-5 w-5" />
      </span>
    </button>
  );
}
