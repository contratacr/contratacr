import { expect, test } from "playwright/test";
import { loginAs, isMobileProject } from "./helpers";

/**
 * ABRIR UNA SECCIÓN NO DIBUJA UN SUBRAYADO OSCURO.
 *
 * Tailwind v4 no le pone color por defecto al borde: usa `currentColor`, o
 * sea el color del texto. Si una cabecera estrena SU ANCHO y SU COLOR de
 * borde a la vez, y encima lleva `transition-colors`, el navegador anima el
 * color DESDE el azul marino del texto hasta el gris: se ve un subrayado
 * oscuro que aparece y se borra solo. Medido antes del arreglo: el borde
 * nacía en rgb(17,24,39) y tardaba 136 ms en llegar a rgb(238,242,246).
 *
 * La cura es que el color vaya siempre —cerrada no se ve, porque el ancho es
 * cero— y que solo cambie el ancho, que no entra en `transition-colors`.
 * Esta prueba mira el borde cuadro a cuadro mientras la sección abre.
 */

const CLIENTE = "cliente.pruebas@contratacr.test";
const CLAVE = "ClientePruebas2026!";

/** Un gris de línea del app anda por 238; el texto marino, por 20. */
const LUZ_MINIMA = 200;

test("una sección abre sin subrayado oscuro", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "el acordeón con borde es de computadora");
  test.setTimeout(180_000);

  await loginAs(page, CLIENTE, CLAVE);
  await page.goto("/es/dashboard/profesional?tab=profile");
  await page.waitForTimeout(3500);

  await page.evaluate(() => {
    const w = window as unknown as { __bordes: string[] };
    w.__bordes = [];
    const mirar = () => {
      const cab = document.querySelector<HTMLElement>('[id^="sec-"] button[aria-expanded="true"]');
      if (cab) {
        const cs = getComputedStyle(cab);
        if (parseFloat(cs.borderBottomWidth) > 0) w.__bordes.push(cs.borderBottomColor);
      }
      requestAnimationFrame(mirar);
    };
    requestAnimationFrame(mirar);
  });

  await page.locator('[id^="sec-"] button').first().click();
  await page.waitForTimeout(1200);

  const colores = await page.evaluate(() => (window as unknown as { __bordes: string[] }).__bordes);
  expect(colores.length).toBeGreaterThan(0);

  const oscuros = colores.filter((c) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
    return m ? (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 < LUZ_MINIMA : false;
  });

  expect(oscuros, `el borde pasó por ${oscuros.length} tonos oscuros, p. ej. ${oscuros[0]}`).toEqual([]);
});
