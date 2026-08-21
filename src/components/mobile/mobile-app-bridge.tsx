"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isNativeAppRuntime } from "@/hooks/use-native-app";
import { NATIVE_ONBOARDING_COMPLETED_KEY } from "@/lib/mobile-onboarding";

// The first history entry of a WebView session is tagged so the hardware back
// button can tell "return to the previous screen" from "leave the app".
const NATIVE_BACK_ROOT_STATE_KEY = "__ccrNativeBackRoot";
const NATIVE_BACK_ROOT_SESSION_KEY = "ccr-native-back-root";

function isSearchPath(pathname: string) {
  return /(^|\/)buscar(\/|$)/.test(pathname);
}

// Flows that own the whole screen: no app header and no bottom nav, because the
// form needs the full height and the route has its own way back.
export function isNativeFullscreenPath(pathname: string) {
  return /(^|\/)publicar-proyecto(\/|$)/.test(pathname);
}

// Overlays own the back gesture while they are open, and each one listens for a
// different dismissal, so back replays whichever gesture that overlay expects.
function dismissTopMostNativeOverlay() {
  // Screens that render their own in-app back control keep owning the gesture,
  // so back returns to the list instead of leaving the screen behind.
  const inAppBack = document.querySelector<HTMLElement>("[data-native-back]");
  if (inAppBack && inAppBack.getBoundingClientRect().width > 0) {
    inAppBack.click();
    return true;
  }

  const assistantOpen = document.documentElement.classList.contains("contratacr-ai-open");
  const escapableLayer = document.querySelector(
    '[data-radix-popper-content-wrapper], [role="dialog"][data-state="open"], [role="menu"][data-state="open"]',
  );
  if (assistantOpen || escapableLayer) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return true;
  }

  // The notification menu closes on a pointer landing outside its panel.
  if (document.querySelector(".ccr-notification-bell-menu")) {
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    return true;
  }

  // The navigation drawer closes through the transparent layer next to it. It
  // stays mounted off-screen, so only an on-screen panel counts as open.
  const drawer = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')].find((panel) => {
    if (panel.dataset.testid?.startsWith("native-first-run")) return false;
    const bounds = panel.getBoundingClientRect();
    return bounds.width > 0 && bounds.left >= 0;
  });
  const drawerDismissLayer = drawer?.previousElementSibling;
  if (drawerDismissLayer instanceof HTMLElement) {
    drawerDismissLayer.click();
    return true;
  }

  return false;
}

function isNativeMarketplaceListPath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const withoutLocale = normalized.replace(/^\/(?:es|en)(?=\/|$)/, "") || "/";
  return withoutLocale === "/ofertas" || withoutLocale === "/empleos";
}

function getNativeLocalizedPath(pathname: string) {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (/^\/(?:es|en)(?=\/|$)/.test(normalized)) return normalized;

  const currentLocale = window.location.pathname.match(/^\/(es|en)(?=\/|$)/)?.[1] ?? "es";
  return `/${currentLocale}${normalized}`;
}

function mountNativeFirstRunPrepaint() {
  if (document.getElementById("ccr-native-first-run-prepaint")) return;
  const prepaint = document.createElement("div");
  prepaint.id = "ccr-native-first-run-prepaint";
  prepaint.setAttribute("aria-hidden", "true");
  prepaint.innerHTML = `
    <div class="ccr-native-first-run-prepaint-bg"></div>
    <div class="ccr-native-first-run-prepaint-shade"></div>
    <div class="ccr-native-first-run-prepaint-content">
      <div class="ccr-native-first-run-prepaint-logo">
        <img src="/logo-mark-dark.png" alt="" />
        <span>Contrata<span>CR</span></span>
      </div>
      <p>Elige como quieres comenzar</p>
      <div class="ccr-native-first-run-prepaint-actions">
        <span>Buscar servicios</span>
        <span>Ofrecer servicios</span>
      </div>
      <div class="ccr-native-first-run-prepaint-cta">Crear una cuenta</div>
      <div class="ccr-native-first-run-prepaint-login">Ya tienes una cuenta? <span>Inicia sesion</span></div>
    </div>
  `;
  document.body.appendChild(prepaint);
}

export function MobileAppBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    const root = document.documentElement;
    let frame = 0;

    const syncNativeInsets = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const nav = document.querySelector<HTMLElement>(".ccr-native-bottom-nav");
        const navHeight = nav?.getBoundingClientRect().height ?? 0;
        const vv = window.visualViewport;
        const visualHeight = vv?.height ?? window.innerHeight;
        const visualTop = vv?.offsetTop ?? 0;
        const keyboardInset = Math.max(0, window.innerHeight - visualHeight - visualTop);
        root.style.setProperty("--ccr-native-live-bottom-nav-height", `${Math.ceil(navHeight)}px`);
        root.style.setProperty("--ccr-native-keyboard-inset", `${Math.ceil(keyboardInset)}px`);
        root.toggleAttribute("data-native-keyboard-open", keyboardInset > 80);
      });
    };

    syncNativeInsets();
    window.addEventListener("resize", syncNativeInsets);
    window.addEventListener("orientationchange", syncNativeInsets);
    window.visualViewport?.addEventListener("resize", syncNativeInsets);
    window.visualViewport?.addEventListener("scroll", syncNativeInsets);
    const observer = new ResizeObserver(syncNativeInsets);
    const nav = document.querySelector<HTMLElement>(".ccr-native-bottom-nav");
    if (nav) observer.observe(nav);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", syncNativeInsets);
      window.removeEventListener("orientationchange", syncNativeInsets);
      window.visualViewport?.removeEventListener("resize", syncNativeInsets);
      window.visualViewport?.removeEventListener("scroll", syncNativeInsets);
      observer.disconnect();
    };
  }, [pathname]);

  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    document.documentElement.classList.add("ccr-native-app");
    document.body.classList.add("ccr-native-app");

    const firstRunPending = window.localStorage.getItem(NATIVE_ONBOARDING_COMPLETED_KEY) !== "1";

    if (firstRunPending) {
      document.documentElement.classList.add("ccr-native-first-run-pending");
      mountNativeFirstRunPrepaint();
    }

    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    const hideSplash = () => {
      if (cancelled) return;
      void import("@capacitor/splash-screen")
        .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 0 }))
        .catch(() => {});
    };

    const hideAfterPaint = () => {
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(hideSplash);
      });
    };

    if (!firstRunPending) {
      hideAfterPaint();
    }

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      document.documentElement.classList.remove("ccr-native-app");
      document.body.classList.remove("ccr-native-app");
    };
  }, []);

  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    const isSearchRoute = isSearchPath(pathname);
    // Routes that, like the web, mount only the drawer and draw their own title
    // bar: the shell must not reserve space for an app header that is not there.
    const isMarketplaceRoute = /(^|\/)(?:ofertas|empleos|servicios)(\/|$)/.test(pathname);
    const isFullscreenRoute = isNativeFullscreenPath(pathname);
    document.documentElement.classList.toggle("ccr-native-search-route", isSearchRoute);
    document.body.classList.toggle("ccr-native-search-route", isSearchRoute);
    for (const root of [document.documentElement, document.body]) {
      root.classList.toggle("ccr-native-marketplace-route", isMarketplaceRoute);
      root.classList.toggle("ccr-native-fullscreen-route", isFullscreenRoute);
    }
    document.documentElement.classList.remove("ccr-native-web-parity");
    document.body.classList.remove("ccr-native-web-parity");
    return () => {
      for (const root of [document.documentElement, document.body]) {
        root.classList.remove("ccr-native-marketplace-route", "ccr-native-fullscreen-route");
      }
      document.documentElement.classList.remove("ccr-native-search-route");
      document.body.classList.remove("ccr-native-search-route");
      document.documentElement.classList.remove("ccr-native-web-parity");
      document.body.classList.remove("ccr-native-web-parity");
    };
  }, [pathname]);

  useEffect(() => {
    if (!isNativeAppRuntime()) return;

    const onNativeMarketplaceClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const rawHref = anchor.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) return;

      let url: URL;
      try {
        url = new URL(rawHref, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;
      if (!isNativeMarketplaceListPath(url.pathname)) return;

      const targetPath = getNativeLocalizedPath(url.pathname);
      const targetHref = `${targetPath}${url.search}${url.hash}`;
      const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (targetHref === currentHref) return;

      event.preventDefault();
      event.stopPropagation();
      // Marketplace list pages are server-rendered. In the native WebView, SPA
      // transitions to these routes can race the RSC payload and land on the
      // global error screen, while a full localized navigation loads cleanly.
      window.location.assign(targetHref);
    };

    // Kept as an explicit opt-in: marketplace links now navigate in-document.
    // Flip the flag only if the RSC failure that motivated full reloads returns.
    const FORCE_DOCUMENT_NAVIGATION = false;
    if (!FORCE_DOCUMENT_NAVIGATION) return;
    document.addEventListener("click", onNativeMarketplaceClick, true);
    return () => document.removeEventListener("click", onNativeMarketplaceClick, true);
  }, []);

  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    let cancelled = false;
    let removeListener: (() => void) | undefined;

    // Android delivers back to the WebView, whose canGoBack() does not track the
    // router's same-document navigations. Without this the activity just closes.
    try {
      if (window.sessionStorage.getItem(NATIVE_BACK_ROOT_SESSION_KEY) !== "1") {
        window.sessionStorage.setItem(NATIVE_BACK_ROOT_SESSION_KEY, "1");
        const state = (window.history.state ?? {}) as Record<string, unknown>;
        window.history.replaceState({ ...state, [NATIVE_BACK_ROOT_STATE_KEY]: true }, "");
      }
    } catch {
      // Private storage can be unavailable; the fallback below still applies.
    }

    void import("@capacitor/app")
      .then(async ({ App }) => {
        if (cancelled) return;

        const handle = await App.addListener("backButton", () => {
          if (dismissTopMostNativeOverlay()) return;

          const state = window.history.state as Record<string, unknown> | null;
          if (state?.[NATIVE_BACK_ROOT_STATE_KEY] || window.history.length <= 1) {
            void App.exitApp();
            return;
          }

          const from = window.location.href;
          window.history.back();
          // The root tag is lost whenever the router replaces the entry, so a
          // back that goes nowhere must still let the user leave the app.
          window.setTimeout(() => {
            if (window.location.href === from) void App.exitApp();
          }, 600);
        });

        if (cancelled) {
          void handle.remove();
          return;
        }
        removeListener = () => void handle.remove();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    // `main` is position:fixed in the native shell, which makes it a stacking
    // context: a full-screen modal rendered inside it can never paint above the
    // app header or the bottom nav, however high its z-index. While such a
    // modal is open, the shell steps aside and gives the modal the whole height.
    const roots = [document.documentElement, document.body];
    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const open = !!document.querySelector(".app-modal-screen:not(.app-centered-modal-screen)");
        for (const root of roots) root.classList.toggle("ccr-native-fullscreen-layer", open);
      });
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      for (const root of roots) root.classList.remove("ccr-native-fullscreen-layer");
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

  return null;
}
