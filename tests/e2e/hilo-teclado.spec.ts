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

// Lo que pasaba en el iPhone de verdad: Safari no avisa del tamaño final al
// cerrar el teclado y el app se quedaba creyendo que seguía abierto. Aquí NADIE
// apaga la marca a mano: solo se suelta el campo, y el app tiene que darse
// cuenta solo.
test("al soltar el campo el app deja de creer que hay teclado", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), "El hilo a pantalla completa es del teléfono.");
  await loginAs(page, "e2e.pro@contratacr.test", process.env.E2E_TEST_PASSWORD ?? "");
  await gotoOK(page, "/es/dashboard/profesional?tab=soporte");
  const fila = page.locator("[data-tiquete]").first();
  await expect(fila).toBeVisible({ timeout: 20_000 });
  await fila.click();
  const hilo = page.locator(".ccr-support-thread");
  await expect(hilo).toBeVisible();
  const campo = hilo.locator("textarea, input[type=text]").first();
  test.skip(!(await campo.isVisible().catch(() => false)), "Este caso ya no admite respuestas.");

  await campo.focus();
  // El estado en que iOS deja la pantalla con el teclado arriba, y que se quedaba pegado.
  await page.evaluate(() => {
    const raiz = document.documentElement;
    raiz.style.setProperty("--app-visual-viewport-top", "345px");
    raiz.style.setProperty("--app-visual-viewport-height", "400px");
    raiz.toggleAttribute("data-keyboard-open", true);
  });
  await expect.poll(async () => hilo.evaluate((n) => Math.round(n.getBoundingClientRect().top))).toBe(345);

  await campo.evaluate((n) => (n as HTMLElement).blur());
  await expect.poll(async () => page.evaluate(() => document.documentElement.hasAttribute("data-keyboard-open")), { timeout: 4000 }).toBe(false);
  const caja = await hilo.evaluate((n) => { const b = n.getBoundingClientRect(); return { top: Math.round(b.top), alto: Math.round(b.height), pantalla: window.innerHeight }; });
  expect(caja.top).toBe(0);
  expect(caja.alto).toBeGreaterThanOrEqual(caja.pantalla - 2);
});

