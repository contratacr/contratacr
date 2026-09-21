import { expect, test } from "playwright/test";
import { loginAs, isMobileProject } from "./helpers";

/**
 * UNA SECCIÓN SE ABRE ARRIBA DEL TODO, Y SE QUEDA.
 *
 * Esto se arregló muchas veces a base de añadir más `scrollTo(0)` y seguía
 * fallando en el iPhone, porque el problema no era que faltaran llamadas sino
 * que algo las deshacía después: la inercia de WebKit, el candado del cuerpo al
 * cerrarse un menú, o la memoria de desplazamiento del navegador. La prueba
 * imita ese «después» y exige que la pantalla acabe arriba igual.
 *
 * La otra mitad importa lo mismo: la app NO puede pelear contra el dedo. Si el
 * usuario arrastra después de abrir, manda él.
 */

const EMAIL = "e2e.pro@contratacr.test";
const PASSWORD = process.env.E2E_TEST_PASSWORD || "";

test.describe("abrir una sección", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo), "el fallo es de teléfono");
    await loginAs(page, EMAIL, PASSWORD);
  });

  const desplazamiento = (page: import("playwright/test").Page) =>
    page.evaluate(() => Math.round(window.scrollY));

  async function seccionLargaYAbajoDelTodo(page: import("playwright/test").Page) {
    await page.goto("/es/dashboard/profesional?tab=services");
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, 99999));
    await page.waitForTimeout(400);
    expect(await desplazamiento(page)).toBeGreaterThan(100);
  }

  test("estrena arriba aunque algo la baje justo después", async ({ page }) => {
    await seccionLargaYAbajoDelTodo(page);

    // Lo que hace WebKit cuando queda inercia de un deslizamiento: descarta el
    // desplazamiento programático y sigue bajando por su cuenta.
    await page.evaluate(() => {
      setTimeout(() => window.scrollTo(0, 300), 100);
      setTimeout(() => window.scrollTo(0, 300), 260);
      setTimeout(() => window.scrollTo(0, 300), 480);
    });
    await page.locator("header button").first().click(); // volver
    await page.waitForTimeout(1300);

    expect(await desplazamiento(page)).toBe(0);
  });

  test("estrena arriba aunque venga de un deslizamiento", async ({ page }) => {
    await seccionLargaYAbajoDelTodo(page);
    await page.evaluate(() => window.dispatchEvent(new Event("touchmove")));
    await page.waitForTimeout(120);
    await page.locator("header button").first().click();
    await page.waitForTimeout(1200);

    expect(await desplazamiento(page)).toBe(0);
  });

  test("el dedo manda: arrastrar tras abrir no se deshace", async ({ page }) => {
    await seccionLargaYAbajoDelTodo(page);
    await page.evaluate(() => {
      setTimeout(() => {
        window.dispatchEvent(new Event("touchmove"));
        window.scrollTo(0, 220);
      }, 150);
    });
    await page.locator("header button").first().click();
    await page.waitForTimeout(1200);

    expect(await desplazamiento(page)).toBe(220);
  });

  test("abrir una sección desde el menú no devuelve la pantalla abajo", async ({ page }) => {
    await page.goto("/es/dashboard/profesional");
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, 99999));
    await page.waitForTimeout(400);

    const menu = page.locator('header button[aria-label*="men" i]').first();
    await menu.click();
    await page.waitForTimeout(600);
    // Con el menú abierto el cuerpo queda fijado: la ventana YA marca 0 y el
    // candado guarda la altura anterior para restaurarla al cerrarse.
    expect(await page.evaluate(() => document.body.style.position)).toBe("fixed");

    await page.getByRole("link", { name: "Cotizaciones", exact: true }).first().click();
    await page.waitForTimeout(2500);

    expect(await desplazamiento(page)).toBe(0);
  });
});
