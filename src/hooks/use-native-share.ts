"use client";

import { useSyncExternalStore } from "react";

// ¿Existe la hoja nativa de compartir? Solo en el teléfono. Se resuelve con
// useSyncExternalStore para que el servidor pinte "no" y el navegador corrija
// en la hidratación, sin efectos ni parpadeo.
const sinCambios = () => () => {};
const enElNavegador = () => typeof navigator !== "undefined" && typeof navigator.share === "function";
const enElServidor = () => false;

export function useNativeShare(): boolean {
  return useSyncExternalStore(sinCambios, enElNavegador, enElServidor);
}
