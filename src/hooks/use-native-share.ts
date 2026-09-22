"use client";

import { useSyncExternalStore } from "react";

// ¿Hay hoja nativa de compartir Y estamos en un teléfono?
//
// Chrome en macOS TAMBIÉN trae `navigator.share`, así que preguntar solo por la
// función daba «sí» en una computadora: la cotización salía con «Descargar PDF»
// y «Compartir» en pantalla grande, y ese segundo botón abre una hoja del
// sistema que en escritorio no es como se manda nada. Se pregunta además por el
// puntero, igual que `esRaton()` en el botón de compartir del perfil: con ratón
// no hay hoja que valga.
const sinCambios = () => () => {};
const enElNavegador = () =>
  typeof navigator !== "undefined"
  && typeof navigator.share === "function"
  && !(typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches);
const enElServidor = () => false;

export function useNativeShare(): boolean {
  return useSyncExternalStore(sinCambios, enElNavegador, enElServidor);
}
