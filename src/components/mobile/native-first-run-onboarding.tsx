"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

// Cambiar de idioma navega a la otra ruta y desmonta la pantalla: se recuerda
// que estaba abierta para volver a mostrarla al llegar.
const ACCESO_ABIERTO_KEY = "ccr:acceso-abierto:v1";

function routeWithoutLocale(pathname: string | null) {
  return (pathname ?? "/").replace(/^\/(?:es|en)(?=\/|$)/, "") || "/";
}

function readPendingPath(): NativeOnboardingPendingPath | null {
  const value = window.localStorage.getItem(NATIVE_ONBOARDING_PENDING_PATH_KEY);
  return value === "/login" || value === "/registro/cliente" || value === "/registro/profesional"
    ? value
    : null;
}

function esRutaDeAcceso(path: string) {
  return path === "/login" || path === "/registro";
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
  // Abierta fuera del primer arranque: desde "Ingresar" del menú ("menu") o
  // porque la app llegó a una ruta de acceso ("ruta").
  const [origenAcceso, setOrigenAcceso] = useState<"menu" | "ruta" | null>(null);
  const abiertaManualmente = origenAcceso !== null;
  // Ruta de acceso a la que la propia bienvenida acaba de mandar: ahí sí se
  // muestra el formulario, o se entraría en bucle.
  const accesoPermitidoRef = useRef<string | null>(null);
  // Ruta desde la que la bienvenida acaba de ceder el paso: el efecto se vuelve
  // a ejecutar antes de que cambie la ruta y sin esto la levantaría de nuevo.
  const rutaEntregadaRef = useRef<string | null>(null);
  const english = pathname?.startsWith("/en") ?? false;

  useEffect(() => {
    if (!nativeApp) return;
    const abrir = () => {
      window.sessionStorage.setItem(ACCESO_ABIERTO_KEY, "menu");
      setOrigenAcceso("menu");
      document.documentElement.classList.add("ccr-native-first-run-pending");
      setVisible(true);
    };
    window.addEventListener("ccr:open-access", abrir);
    // Estaba abierta antes de cambiar de idioma: se vuelve a mostrar.
    if (window.sessionStorage.getItem(ACCESO_ABIERTO_KEY) === "menu" && !user) abrir();
    return () => window.removeEventListener("ccr:open-access", abrir);
  }, [nativeApp, user]);

  useEffect(() => {
    if (!nativeApp) return;
    const syncFirstRunState = () => {
      if (abiertaManualmente) return;
      if (!user && window.sessionStorage.getItem(ACCESO_ABIERTO_KEY) === "menu") return;
      const completed = window.localStorage.getItem(NATIVE_ONBOARDING_COMPLETED_KEY) === "1";
      const ruta = routeWithoutLocale(pathname);
      if (!esRutaDeAcceso(ruta)) accesoPermitidoRef.current = null;
      if (rutaEntregadaRef.current !== null && rutaEntregadaRef.current !== ruta) rutaEntregadaRef.current = null;
      if (
        completed &&
        !user &&
        !authLoading &&
        esRutaDeAcceso(ruta) &&
        accesoPermitidoRef.current !== ruta &&
        rutaEntregadaRef.current !== ruta
      ) {
        document.documentElement.classList.add("ccr-native-first-run-pending");
        setOrigenAcceso("ruta");
        setVisible(true);
        hideNativeSplashAfterPaint();
        return;
      }
      if (completed || user) {
        if (user) window.sessionStorage.removeItem(ACCESO_ABIERTO_KEY);
        if (user && !completed) {
          window.localStorage.setItem(NATIVE_ONBOARDING_COMPLETED_KEY, "1");
          window.dispatchEvent(new Event(NATIVE_ONBOARDING_COMPLETED_EVENT));
        }
        window.localStorage.removeItem(NATIVE_ONBOARDING_PENDING_PATH_KEY);
        document.documentElement.classList.remove("ccr-native-first-run-pending");
        setVisible(false);
        hideNativeSplashAfterPaint();
        return;
      }

      if (authLoading) return;
      const pendingPath = readPendingPath();
      const currentRoute = routeWithoutLocale(pathname);
      const authSession = window.sessionStorage.getItem(NATIVE_ONBOARDING_AUTH_SESSION_KEY) === "1";
      if (authSession && isPendingJourneyPath(currentRoute)) {
        document.documentElement.classList.remove("ccr-native-first-run-pending");
        setVisible(false);
        hideNativeSplashAfterPaint();
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
  }, [abiertaManualmente, authLoading, nativeApp, pathname, router, user]);

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
    window.sessionStorage.removeItem(ACCESO_ABIERTO_KEY);
    accesoPermitidoRef.current = destination;
    rutaEntregadaRef.current = routeWithoutLocale(pathname);
    setOrigenAcceso(null);
    window.localStorage.removeItem(NATIVE_ONBOARDING_PENDING_PATH_KEY);
    window.sessionStorage.setItem(NATIVE_ONBOARDING_AUTH_SESSION_KEY, "1");
    document.documentElement.classList.remove("ccr-native-first-run-pending");
    setVisible(false);
    router.push(destination);
    hideNativeSplashAfterPaint();
  }, [pathname, router]);

  const continueWithRole = useCallback(() => {
    const destination = destinationFor(selectedRole);
    continuePendingJourney(destination);
  }, [continuePendingJourney, destinationFor, selectedRole]);

  const cerrarAcceso = useCallback(() => {
    // Si llegó por una ruta de acceso, cerrar es volver a lo anterior; si se
    // abrió desde el menú, basta con quitarla de encima.
    window.sessionStorage.removeItem(ACCESO_ABIERTO_KEY);
    const volver = origenAcceso === "ruta";
    rutaEntregadaRef.current = routeWithoutLocale(pathname);
    setOrigenAcceso(null);
    document.documentElement.classList.remove("ccr-native-first-run-pending");
    setVisible(false);
    if (volver) {
      // Si la app entró directo a /login no hay nada atrás: se vuelve al inicio.
      if (window.history.length > 1) router.back();
      else router.replace("/");
    }
    hideNativeSplashAfterPaint();
  }, [origenAcceso, pathname, router]);

  const goToLogin = useCallback(() => {
    window.sessionStorage.removeItem(ACCESO_ABIERTO_KEY);
    accesoPermitidoRef.current = "/login";
    rutaEntregadaRef.current = routeWithoutLocale(pathname);
    setOrigenAcceso(null);
    window.localStorage.removeItem(NATIVE_ONBOARDING_PENDING_PATH_KEY);
    window.sessionStorage.setItem(NATIVE_ONBOARDING_AUTH_SESSION_KEY, "1");
    document.documentElement.classList.remove("ccr-native-first-run-pending");
    setVisible(false);
    router.push("/login");
    hideNativeSplashAfterPaint();
  }, [pathname, router]);

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
      onClose={abiertaManualmente ? cerrarAcceso : undefined}
      onHeroReady={marcarHeroListo}
    />,
    document.body,
  );
}
