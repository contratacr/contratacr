import { test, expect } from "playwright/test";
import { gotoOK, isMobileProject, loginAs } from "./helpers";

// EL HILO A PANTALLA COMPLETA NO PUEDE QUEDAR A MEDIA PANTALLA.
// Safari en iPhone desplaza el documento para dejar ver el campo y devuelve el
// desfase a cero en su propio tiempo: al cerrar el teclado el hilo se quedaba
// pintado más abajo, con una franja gris arriba y el pie descuadrado.
test("el hilo de soporte vuelve a su sitio al cerrarse el teclado", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), "El hilo a pantalla completa es del teléfono.");
  await loginAs(page, "e2e.pro@contratacr.test", process.env.E2E_TEST_PASSWORD ?? "");
  await gotoOK(page, "/es/dashboard/profesional?tab=soporte");
  const fila = page.locator("[data-tiquete]").first();
  // La lista se pide al montar: sin esperarla, la fila «no existe» todavía.
  await expect(fila).toBeVisible({ timeout: 20_000 });
  await fila.click();
  const hilo = page.locator(".ccr-support-thread");
  await expect(hilo).toBeVisible();

  const caja = async () => hilo.evaluate((n) => { const b = n.getBoundingClientRect(); return { top: Math.round(b.top), alto: Math.round(b.height), pantalla: window.innerHeight }; });
  const inicial = await caja();
  expect(inicial.top).toBe(0);
  expect(inicial.alto).toBeGreaterThanOrEqual(inicial.pantalla - 2);

  // Lo que hace iOS: desplaza el hilo y lo encoge mientras se escribe…
  await page.evaluate(() => {
    const raiz = document.documentElement;
    raiz.style.setProperty("--app-visual-viewport-top", "260px");
    raiz.style.setProperty("--app-visual-viewport-height", "420px");
    raiz.toggleAttribute("data-keyboard-open", true);
  });
  await expect.poll(async () => (await caja()).top).toBe(260);

  // …y al cerrarse deja los valores viejos puestos. El hilo igual vuelve entero.
  await page.evaluate(() => document.documentElement.toggleAttribute("data-keyboard-open", false));
  await expect.poll(async () => (await caja()).top).toBe(0);
  const final = await caja();
  expect(final.alto).toBeGreaterThanOrEqual(final.pantalla - 2);
});
