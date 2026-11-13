import { ENLACE_RESENA_GOOGLE } from "./resena-google-enlace";

/**
 * A DÓNDE VA «DEJAR MI RESEÑA», según desde dónde la pide la persona.
 *
 *  - App de iPhone → el formulario de reseña de ContrataCR en el App Store
 *    (`action=write-review` abre directo la hoja para escribirla).
 *  - App de Android → la ficha de ContrataCR en Google Play: Play no tiene un
 *    enlace que abra directo el formulario; las estrellas están en la ficha.
 *  - Navegador, o una app cuyo sistema no se pudo saber → la reseña de Google,
 *    que abre en cualquier parte. Nunca se adivina la tienda.
 *
 * Es un ENLACE y no la ventana de estrellas del sistema: Apple y Google piden no
 * llamarla desde un botón porque el sistema decide si aparece, y la persona
 * tocaría «Dejar mi reseña» sin que pase nada. Como ni apps.apple.com ni
 * play.google.com están en `allowNavigation` (capacitor.config.ts), la app no
 * los abre dentro: se los entrega al sistema, que abre la tienda.
 */
export const RESENA_APP_STORE = "https://apps.apple.com/app/id6794559661?action=write-review";
export const RESENA_GOOGLE_PLAY = "https://play.google.com/store/apps/details?id=com.contratacr.app";

export type DestinoResena = { destino: "app_store" | "google_play" | "google"; href: string };

export function destinoDeResena(enApp: boolean, sistema: string | null | undefined): DestinoResena {
  if (enApp && sistema === "ios") return { destino: "app_store", href: RESENA_APP_STORE };
  if (enApp && sistema === "android") return { destino: "google_play", href: RESENA_GOOGLE_PLAY };
  return { destino: "google", href: ENLACE_RESENA_GOOGLE };
}
