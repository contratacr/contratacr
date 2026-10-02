import { test, expect } from "playwright/test";
import { gotoOK, isMobileProject, loginAs } from "./helpers";

// EL HILO A PANTALLA COMPLETA NO PUEDE QUEDAR A MEDIA PANTALLA.
// Safari en iPhone desplaza el documento para dejar ver el campo y devuelve el
// desfase a cero en su propio tiempo: al cerrar el teclado el hilo se quedaba
// pintado más abajo, con una franja gris arriba y el pie descuadrado.
test("el hilo de soporte vuelve a su sitio al cerrarse el teclado", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), "El hilo a pantalla completa es del teléfono.");
  await loginAs(page, "e2e.pro@contratacr.test", process.env.E2E_TEST_PASSWORD ?? "");
  await gotoOK(page, "/dashboard/profesional?tab=soporte");
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
  // Con el campo enfocado, como de verdad: sin foco, el vigilante del app
  // (siguiente prueba) apaga la marca de teclado por su cuenta y, según cuándo
  // corriera, esta prueba medía 0 en vez de 260.
  await hilo.locator("textarea, input[type=text]").first().focus();
  // Se vuelve a poner en cada intento: cualquier aviso tardío del viewport (el
  // enfoque desplaza el campo a la vista, en CI llega después) hace que el
  // vigilante del app remida —en el emulador, sin teclado: desfase 0— y borre
  // el estado simulado. Lo que se prueba es la regla de CSS, no la carrera.
  const simularTeclado = () => page.evaluate(() => {
    const raiz = document.documentElement;
    raiz.style.setProperty("--app-visual-viewport-top", "260px");
    raiz.style.setProperty("--app-visual-viewport-height", "420px");
    raiz.toggleAttribute("data-keyboard-open", true);
  });
  await expect.poll(async () => { await simularTeclado(); return (await caja()).top; }).toBe(260);

  // …y al cerrarse deja los valores viejos puestos. El hilo igual vuelve entero.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    document.documentElement.toggleAttribute("data-keyboard-open", false);
  });
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
  await gotoOK(page, "/dashboard/profesional?tab=soporte");
  const fila = page.locator("[data-tiquete]").first();
  await expect(fila).toBeVisible({ timeout: 20_000 });
  await fila.click();
  const hilo = page.locator(".ccr-support-thread");
  await expect(hilo).toBeVisible();
  const campo = hilo.locator("textarea, input[type=text]").first();
  test.skip(!(await campo.isVisible().catch(() => false)), "Este caso ya no admite respuestas.");

  await campo.focus();
  // El estado en que iOS deja la pantalla con el teclado arriba —y que se
  // quedaba pegado—, y soltar el campo, en el MISMO instante. Por separado la
  // prueba competía con el app: en el emulador no hay teclado, y el app ahora
  // lo dice enseguida y deshace el estado antes de poder comprobarlo.
  await campo.evaluate((n) => {
    const raiz = document.documentElement;
    raiz.style.setProperty("--app-visual-viewport-top", "345px");
    raiz.style.setProperty("--app-visual-viewport-height", "400px");
    raiz.toggleAttribute("data-keyboard-open", true);
    (n as HTMLElement).blur();
  });
  await expect.poll(async () => page.evaluate(() => document.documentElement.hasAttribute("data-keyboard-open")), { timeout: 4000 }).toBe(false);
  const caja = await hilo.evaluate((n) => { const b = n.getBoundingClientRect(); return { top: Math.round(b.top), alto: Math.round(b.height), pantalla: window.innerHeight }; });
  expect(caja.top).toBe(0);
  expect(caja.alto).toBeGreaterThanOrEqual(caja.pantalla - 2);
});

