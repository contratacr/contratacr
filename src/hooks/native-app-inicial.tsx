"use client";

import { createContext, type ReactNode } from "react";

// Lo que el SERVIDOR ya sabe por la cookie `ccr_platform=native`. Sirve de
// valor inicial de `useNativeApp`, para que el HTML y la primera pasada del
// navegador digan lo mismo y lo nativo (la barra de abajo, por ejemplo) viaje
// pintado desde el servidor en vez de aparecer después de hidratar.
export const NativeAppInicial = createContext(false);

export function NativeAppInicialProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <NativeAppInicial.Provider value={value}>{children}</NativeAppInicial.Provider>;
}
