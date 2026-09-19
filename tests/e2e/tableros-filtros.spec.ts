import { test, expect, type Page } from "playwright/test";
import { gotoOK } from "./helpers";

// Buscar y filtrar en los tres tableros, por la dirección: es como llegan los
// filtros desde la ficha de un empleo, y el tablero los ignoraba (solo leía
// «q» y «location»), así que «Remoto» desde una ficha abría la lista entera.
const TABLEROS = [
  { ruta: "/es/empleos", enlace: 'a[href*="/empleos/"]' },
  { ruta: "/es/ofertas", enlace: 'a[href*="/ofertas/"]' },
  { ruta: "/es/proyectos", enlace: 'a[href*="/proyectos/"]' },
];

async function contar(page: Page, ruta: string, enlace: string, consulta = "") {
  await gotoOK(page, ruta + (consulta ? `?${consulta}` : ""));
  await page.waitForTimeout(1200);
  return page.locator(enlace).evaluateAll((nodos) => new Set(nodos.map((n) => (n as HTMLAnchorElement).pathname).filter((p) => /\/[0-9a-f-]{20,}$/.test(p))).size);
}

for (const { ruta, enlace } of TABLEROS) {
  test(`${ruta}: una búsqueda sin sentido deja el tablero vacío y con su mensaje`, async ({ page }) => {
    const todo = await contar(page, ruta, enlace);
    test.skip(todo === 0, "El tablero no tiene publicaciones sembradas.");
    expect(await contar(page, ruta, enlace, "q=zzqxnoexiste")).toBe(0);
    await expect(page.getByText(/No (hay|encontramos)|Sin resultados|No results/i).first()).toBeVisible();
  });
}

test("/es/empleos: los filtros que llegan por la dirección se aplican", async ({ page }) => {
  const { ruta, enlace } = TABLEROS[0];
  const todo = await contar(page, ruta, enlace);
  test.skip(todo < 2, "Hacen falta al menos dos empleos sembrados.");
  const porModalidad = await Promise.resolve().then(async () => {
    const cuentas: number[] = [];
    for (const modalidad of ["remote", "onsite", "hybrid"]) cuentas.push(await contar(page, ruta, enlace, `workplace=${modalidad}`));
    return cuentas;
  });
  // Las tres modalidades reparten el total: ninguna puede devolver la lista entera
  // salvo que todos los empleos sean de esa modalidad.
  expect(porModalidad.reduce((a, b) => a + b, 0)).toBe(todo);
  // Un valor inventado cuenta como «todos», no rompe la pantalla.
  expect(await contar(page, ruta, enlace, "workplace=inventado")).toBe(todo);
});
