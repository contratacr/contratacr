import { expect, test } from "playwright/test";
import { destinoDeResena, RESENA_APP_STORE, RESENA_GOOGLE_PLAY } from "../../src/lib/notifications/resena-destino";
import { ENLACE_RESENA_GOOGLE } from "../../src/lib/notifications/resena-google-enlace";

// A dónde manda "Dejar mi reseña": la tienda de SU teléfono dentro de la app,
// Google en el navegador, y Google también cuando el sistema no se sabe.
test.describe("destino de la reseña", () => {
  test("app de iPhone → formulario de reseña del App Store", () => {
    expect(destinoDeResena(true, "ios")).toEqual({ destino: "app_store", href: RESENA_APP_STORE });
    expect(RESENA_APP_STORE).toBe("https://apps.apple.com/app/id6794559661?action=write-review");
  });

  test("app de Android → ficha de Google Play", () => {
    expect(destinoDeResena(true, "android")).toEqual({ destino: "google_play", href: RESENA_GOOGLE_PLAY });
    expect(RESENA_GOOGLE_PLAY).toBe("https://play.google.com/store/apps/details?id=com.contratacr.app");
  });

  test("navegador o sistema desconocido → reseña de Google, nunca una tienda adivinada", () => {
    for (const [enApp, sistema] of [[false, "web"], [false, "ios"], [false, "android"], [true, "web"], [true, null], [true, undefined], [true, "electron"]] as const) {
      expect(destinoDeResena(enApp, sistema)).toEqual({ destino: "google", href: ENLACE_RESENA_GOOGLE });
    }
  });
});
