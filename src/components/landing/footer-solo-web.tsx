"use client";

import { LandingFooter } from "@/components/landing/landing-footer";
import { useNativeApp } from "@/hooks/use-native-app";

/**
 * El pie de página, pero solo en la web. En la app no va: ahí la salida es la
 * barra de abajo, y un pie con enlaces del sitio se siente fuera de lugar.
 */
export function FooterSoloWeb() {
  const nativeApp = useNativeApp();
  if (nativeApp) return null;
  return <LandingFooter />;
}
