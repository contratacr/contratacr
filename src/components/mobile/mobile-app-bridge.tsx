"use client";

import { useEffect } from "react";
import { isNativeAppRuntime } from "@/hooks/use-native-app";

function canPullToRefresh(pathname: string) {
  return /\/(dashboard|mensajes|notificaciones|buscar)(\/|$)/.test(pathname);
}

export function MobileAppBridge() {
  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    document.documentElement.classList.add("ccr-native-app");
    document.body.classList.add("ccr-native-app");
    return () => {
      document.documentElement.classList.remove("ccr-native-app");
      document.body.classList.remove("ccr-native-app");
    };
  }, []);

  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    const overlay = document.createElement("div");
    overlay.className = "ccr-native-boot";
    overlay.innerHTML = `
      <div class="ccr-native-boot-card" aria-label="ContrataCR">
        <img src="/logo-mark-transparent.png" alt="" />
      </div>
    `;
    document.body.appendChild(overlay);

    let hiding = false;
    let hideTimer: number | null = null;
    const hide = () => {
      if (hiding) return;
      hiding = true;
      hideTimer = window.setTimeout(() => {
        overlay.classList.add("is-hiding");
        window.setTimeout(() => overlay.remove(), 260);
      }, 420);
    };

    const startedAt = window.performance.now();
    const waitUntilReady = () => {
      const elapsed = window.performance.now() - startedAt;
      const appStillShowingBrandLoader = Boolean(document.querySelector(".ccr-brand-loading-mark"));
      if ((!appStillShowingBrandLoader && elapsed > 650) || elapsed > 4500) {
        hide();
        return;
      }
      window.setTimeout(waitUntilReady, 120);
    };

    const readyFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(waitUntilReady);
    });
    const fallbackTimer = window.setTimeout(hide, 5200);

    return () => {
      window.cancelAnimationFrame(readyFrame);
      window.clearTimeout(fallbackTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
      overlay.remove();
    };
  }, []);

  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    let haptics: typeof import("@capacitor/haptics")["Haptics"] | null = null;

    void import("@capacitor/haptics")
      .then((mod) => {
        haptics = mod.Haptics;
      })
      .catch(() => {});

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const action = target.closest("button, a, [role='button']");
      if (!action || action.getAttribute("aria-disabled") === "true") return;
      void haptics?.selectionStart().catch(() => {});
    };

    const onPointerUp = () => {
      void haptics?.selectionEnd().catch(() => {});
    };

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("pointerup", onPointerUp, { passive: true });
    document.addEventListener("pointercancel", onPointerUp, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    const indicator = document.createElement("div");
    indicator.className = "ccr-native-refresh-indicator";
    indicator.textContent = "Actualizar";
    document.body.appendChild(indicator);

    let startY = 0;
    let pulling = false;
    let armed = false;
    let haptics: typeof import("@capacitor/haptics")["Haptics"] | null = null;
    let impactStyle: typeof import("@capacitor/haptics")["ImpactStyle"] | null = null;

    void import("@capacitor/haptics")
      .then((mod) => {
        haptics = mod.Haptics;
        impactStyle = mod.ImpactStyle;
      })
      .catch(() => {});

    const reset = () => {
      pulling = false;
      armed = false;
      indicator.classList.remove("is-visible", "is-armed");
      indicator.style.setProperty("--ccr-pull-distance", "0px");
    };

    const onTouchStart = (event: TouchEvent) => {
      if (!canPullToRefresh(window.location.pathname)) return;
      if (window.scrollY > 0) return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [data-no-pull-refresh]")) return;
      startY = event.touches[0]?.clientY ?? 0;
      pulling = true;
      armed = false;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pulling || window.scrollY > 0) return;
      const y = event.touches[0]?.clientY ?? 0;
      const distance = Math.max(0, y - startY);
      if (distance < 16) return;
      const damped = Math.min(96, Math.round(distance * 0.45));
      indicator.classList.add("is-visible");
      indicator.style.setProperty("--ccr-pull-distance", `${damped}px`);
      if (!armed && distance > 105) {
        armed = true;
        indicator.classList.add("is-armed");
        if (impactStyle) void haptics?.impact({ style: impactStyle.Light }).catch(() => {});
      } else if (armed && distance < 72) {
        armed = false;
        indicator.classList.remove("is-armed");
      }
    };

    const onTouchEnd = () => {
      if (!pulling) return;
      const shouldRefresh = armed;
      reset();
      if (shouldRefresh) {
        if (impactStyle) void haptics?.impact({ style: impactStyle.Medium }).catch(() => {});
        window.location.reload();
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", reset, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", reset);
      indicator.remove();
    };
  }, []);

  return null;
}
