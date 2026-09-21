import { expect, test, type Page } from "playwright/test";
import { isMobileProject, loginAs } from "./helpers";

/**
 * NADA SALTA AL CARGAR.
 *
 * El navegador mide los saltos de diseño (CLS): cuánto se movió lo que ya
 * estaba pintado. Por encima de 0,05 se nota a simple vista. Estas dos pantallas
 * están aquí porque las dos SE ROMPIERON con arreglos que no tenían nada que
 * ver, y ninguna otra prueba se enteró porque la pantalla termina bien:
 *
 * - /buscar en el teléfono (0,174): una regla de diseño dependía de una clase
 *   que JavaScript le pone al <body> en un efecto, o sea DESPUÉS del primer
 *   pintado. El mapa nacía en y=0, debajo de la barra fija, y bajaba 124 px.
 *   Lección: ninguna regla de geometría puede colgar de una clase puesta por JS.
 * - /notificaciones en computadora (0,118): la tarjeta medía 26rem fijos, el pie
 *   quedaba a la vista durante el esqueleto y salía disparado al llegar la
 *   lista. Lección: si el pie se ve mientras carga, todo crecimiento es un salto.
 */
const UMBRAL = 0.05;

const medir = () => {
  const w = window as unknown as { __cls: number; __peor: string };
  w.__cls = 0; w.__peor = "";
  new PerformanceObserver((lista) => {
    for (const e of lista.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean; sources?: Array<{ node?: Node; previousRect: DOMRect; currentRect: DOMRect }> }>) {
      if (e.hadRecentInput) continue;
      w.__cls += e.value;
      const s = e.sources?.[0];
      const n = s?.node as HTMLElement | undefined;
      if (s && e.value > 0.02) w.__peor = `${n?.tagName?.toLowerCase() ?? "?"}.${(n?.className ?? "").toString().split(" ").slice(0, 3).join(".")} y:${Math.round(s.previousRect.top)}→${Math.round(s.currentRect.top)}`;
    }
  }).observe({ type: "layout-shift", buffered: true });
};

async function clsAlRecargar(page: Page, ruta: string) {
  await page.goto(ruta);
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForTimeout(4500);
  return page.evaluate(() => ({ cls: (window as unknown as { __cls: number }).__cls, peor: (window as unknown as { __peor: string }).__peor }));
}

test("/buscar no salta al cargar", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(medir);
  const r = await clsAlRecargar(page, "/es/buscar");
  expect(r.cls, `lo que más se movió: ${r.peor}`).toBeLessThan(UMBRAL);
});

test("/notificaciones no salta al cargar", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await loginAs(page, "e2e.pro@contratacr.test", process.env.E2E_TEST_PASSWORD || "");
  await page.addInitScript(medir);
  const r = await clsAlRecargar(page, "/es/notificaciones");
  expect(r.cls, `[${isMobileProject(testInfo) ? "teléfono" : "computadora"}] lo que más se movió: ${r.peor}`).toBeLessThan(UMBRAL);
});
