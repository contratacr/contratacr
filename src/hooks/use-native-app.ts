"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";

export function isNativeAppRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return (
    Capacitor.isNativePlatform() ||
    Boolean(capacitor?.isNativePlatform?.()) ||
    document.documentElement.classList.contains("ccr-native-app")
  );
}

// While a full-height overlay (a task modal, a photo viewer) is open on a phone
// in the app, the native chrome (app header + bottom nav) must not float above
// it. This marks the layer; the shell CSS hides the chrome for it.
export function useNativeFullscreenLayer(active: boolean) {
  useEffect(() => {
    if (!active || !isNativeAppRuntime()) return;
    if (!window.matchMedia("(max-width: 639px)").matches) return;
    const roots = [document.documentElement, document.body];
    for (const root of roots) root.classList.add("ccr-native-fullscreen-layer");
    return () => {
      for (const root of roots) root.classList.remove("ccr-native-fullscreen-layer");
    };
  }, [active]);
}

// Capacitor puede llegar un instante después que el HTML: se vuelve a mirar
// unas cuantas veces al montar y se avisa a quien esté escuchando.
const oyentes = new Set<() => void>();

function suscribir(alCambiar: () => void): () => void {
  oyentes.add(alCambiar);
  const avisar = () => oyentes.forEach((oyente) => oyente());
  const timers = [0, 50, 250, 750].map((retraso) => window.setTimeout(avisar, retraso));
  return () => {
    oyentes.delete(alCambiar);
    timers.forEach((timer) => window.clearTimeout(timer));
  };
}

/**
 * ¿Estamos dentro de la app?
 *
 * En el servidor y en la primera pasada del navegador vale `false`, igual que
 * el HTML que llegó: si empezara en `true`, React 19 no repara esa diferencia
 * —tira el árbol entero— y eso salía como "Algo salió mal".
 *
 * Va con `useSyncExternalStore` y no con un efecto a propósito: React aplica el
 * valor del navegador dentro del mismo commit de la hidratación, ANTES de que
 * la pantalla se pinte. Con un efecto, el navegador alcanzaba a dibujar la
 * versión web y el botón cambiaba de texto y de tamaño a la vista: eso era el
 * parpadeo de "Enviar mensaje" en las citas.
 */
export function useNativeApp(): boolean {
  return useSyncExternalStore(suscribir, isNativeAppRuntime, () => false);
}
