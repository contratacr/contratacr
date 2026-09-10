"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useNativeApp } from "@/hooks/use-native-app";
import { WelcomeAccessScreen, type WelcomeRole } from "@/components/mobile/welcome-access-screen";
import {
  NATIVE_ONBOARDING_AUTH_SESSION_KEY,
  NATIVE_ONBOARDING_COMPLETED_EVENT,
  NATIVE_ONBOARDING_COMPLETED_KEY,
  NATIVE_ONBOARDING_PENDING_PATH_KEY,
  type NativeOnboardingPendingPath,
} from "@/lib/mobile-onboarding";

// Bump this key whenever the first-run journey changes materially so an
// existing native installation gets one clean chance to see the new flow.
type Role = WelcomeRole;

function routeWithoutLocale(pathname: string | null) {
  return (pathname ?? "/").replace(/^\/(?:es|en)(?=\/|$)/, "") || "/";
}

function readPendingPath(): NativeOnboardingPendingPath | null {
  const value = window.localStorage.getItem(NATIVE_ONBOARDING_PENDING_PATH_KEY);
  return value === "/login" || value === "/registro/cliente" || value === "/registro/profesional"
    ? value
    : null;
}

function isPendingJourneyPath(path: string): path is NativeOnboardingPendingPath {
  return path === "/login" || path === "/registro/cliente" || path === "/registro/profesional";
}

function hideNativeSplashAfterPaint() {
  let done = false;
  const hide = () => {
    if (done) return;
    done = true;
    void import("@capacitor/splash-screen")
      .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 0 }))
      .catch(() => {});
  };
  window.requestAnimationFrame(() => window.requestAnimationFrame(hide));
  // A WKWebView behind the opaque splash can pause requestAnimationFrame on a
  // real device; a time-based backstop makes sure the splash never gets stuck.
  window.setTimeout(hide, 900);
}

export function NativeFirstRunOnboarding() {
  const nativeApp = useNativeApp();
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  // Keep the server and the first client render identical. The static prepaint
  // in the root layout covers the native splash while this effect-owned state
  // is resolved after hydration.
  const [visible, setVisible] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>("client");
  const [heroReady, setHeroReady] = useState(false);
  const english = pathname?.startsWith("/en") ?? false;

  useEffect(() => {
    if (!nativeApp) return;
    // La portada es SOLO del primer arranque tras instalar. Después, entrar
    // o registrarse usa las mismas pantallas que la web (/login, /registro):
    // volver a levantarla al caer en una ruta de acceso hacía que "Inicia
    // sesión" parpadeara y dejara a la persona en la misma portada.
    const syncFirstRunState = () => {
      const completed = window.localStorage.getItem(NATIVE_ONBOARDING_COMPLETED_KEY) === "1";
      if (completed || user) {
        if (user && !completed) {
          window.localStorage.setItem(NATIVE_ONBOARDING_COMPLETED_KEY, "1");
          window.dispatchEvent(new Event(NATIVE_ONBOARDING_COMPLETED_EVENT));
        }
        window.localStorage.removeItem(NATIVE_ONBOARDING_PENDING_PATH_KEY);
        document.documentElement.classList.remove("ccr-native-first-run-pending");
        setVisible(false);
        return;
      }

      if (authLoading) return;
      const pendingPath = readPendingPath();
      const currentRoute = routeWithoutLocale(pathname);
      const authSession = window.sessionStorage.getItem(NATIVE_ONBOARDING_AUTH_SESSION_KEY) === "1";
      if (authSession && isPendingJourneyPath(currentRoute)) {
        document.documentElement.classList.remove("ccr-native-first-run-pending");
        setVisible(false);
        return;
      }

      if (pendingPath) {
        if (!authSession) {
          window.localStorage.removeItem(NATIVE_ONBOARDING_PENDING_PATH_KEY);
          document.documentElement.classList.add("ccr-native-first-run-pending");
          setVisible(true);
          return;
        }
        if (isPendingJourneyPath(currentRoute)) {
          window.localStorage.setItem(NATIVE_ONBOARDING_PENDING_PATH_KEY, currentRoute);
          document.documentElement.classList.remove("ccr-native-first-run-pending");
          setVisible(false);
          hideNativeSplashAfterPaint();
          return;
        }
        document.documentElement.classList.remove("ccr-native-first-run-pending");
        setVisible(false);
        if (currentRoute !== pendingPath) router.replace(pendingPath);
        hideNativeSplashAfterPaint();
        return;
      }

      document.documentElement.classList.add("ccr-native-first-run-pending");
      setVisible(true);
    };
    syncFirstRunState();
    window.addEventListener("pageshow", syncFirstRunState);
    window.addEventListener("focus", syncFirstRunState);
    document.addEventListener("visibilitychange", syncFirstRunState);
    return () => {
      window.removeEventListener("pageshow", syncFirstRunState);
      window.removeEventListener("focus", syncFirstRunState);
      document.removeEventListener("visibilitychange", syncFirstRunState);
    };
  }, [authLoading, nativeApp, pathname, router, user]);

  useEffect(() => {
    if (!visible) return;
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !nativeApp || !heroReady) return;

    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        void import("@capacitor/splash-screen")
          .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 0 }))
          .catch(() => {});
      });
    });

    return () => window.cancelAnimationFrame(firstFrame);
  }, [heroReady, nativeApp, visible]);

  const marcarHeroListo = useCallback(() => {
    setHeroReady(true);
  }, []);

  const destinationFor = useCallback((role: Role) => {
    if (role === "client") return "/registro/cliente";
    return "/registro/profesional";
  }, []);

  const continuePendingJourney = useCallback((destination: NativeOnboardingPendingPath) => {
    window.localStorage.removeItem(NATIVE_ONBOARDING_PENDING_PATH_KEY);
    window.sessionStorage.setItem(NATIVE_ONBOARDING_AUTH_SESSION_KEY, "1");
    document.documentElement.classList.remove("ccr-native-first-run-pending");
    setVisible(false);
    router.push(destination);
    hideNativeSplashAfterPaint();
  }, [router]);

  const continueWithRole = useCallback(() => {
    const destination = destinationFor(selectedRole);
    continuePendingJourney(destination);
  }, [continuePendingJourney, destinationFor, selectedRole]);

  const goToLogin = useCallback(() => {
    window.localStorage.removeItem(NATIVE_ONBOARDING_PENDING_PATH_KEY);
    window.sessionStorage.setItem(NATIVE_ONBOARDING_AUTH_SESSION_KEY, "1");
    document.documentElement.classList.remove("ccr-native-first-run-pending");
    setVisible(false);
    router.push("/login");
    hideNativeSplashAfterPaint();
  }, [router]);

  if (!visible || !nativeApp) return null;

  return createPortal(
    <WelcomeAccessScreen
      className="fixed inset-0 z-[220]"
      testId="native-first-run-onboarding"
      titleId="native-onboarding-title"
      english={english}
      selectedRole={selectedRole}
      onSelectRole={setSelectedRole}
      onCreateAccount={continueWithRole}
      onLogin={goToLogin}
      onHeroReady={marcarHeroListo}
    />,
    document.body,
  );
}
