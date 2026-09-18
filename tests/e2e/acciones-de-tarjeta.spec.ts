import { expect, test } from "playwright/test";
import { loginAs } from "./helpers";

// Toda fila de acciones de una tarjeta del panel mide lo mismo: botones de 44 px
// con letra de 13, «···» de 44, el mismo aire hasta el borde de la tarjeta y,
// en computadora, alineados a la derecha. Eran tres familias distintas (44/13
// en Proyectos, 40/12 en Empleos y Promociones, y Empleos con 20 px más abajo).
// La regla vive en `layout.tsx` (data-ccr-acciones); esta prueba además le quita
// a la fila sus clases de Tailwind para asegurar que no depende de ellas.

const SECCIONES = [
  { cuenta: "cliente", tab: "sent_projects&mode=use" },
  { cuenta: "pro", tab: "jobs&mode=offer" },
  { cuenta: "pro", tab: "offers&mode=offer" },
] as const;

async function medir(page: import("playwright/test").Page, tab: string) {
  await page.goto(`/es/dashboard/profesional?tab=${tab}`, { waitUntil: "networkidle" });
  const abrir = page.locator("button:has(h2), button:has(h3)").filter({ visible: true }).first();
  if (await abrir.count()) await abrir.click();
  const fila = page.locator(".ccr-acciones-tarjeta").filter({ visible: true }).first();
  await expect(fila).toBeVisible();
  return fila.evaluate((f: HTMLElement) => {
    // Sin clases de Tailwind: solo la regla del documento.
    f.className = "ccr-acciones-tarjeta" + (f.classList.contains("grid") ? " grid" : "");
    const botones = [...f.querySelectorAll("a,button")].filter((b) => (b as HTMLElement).getBoundingClientRect().width > 0 && !b.closest("[role='menu']")) as HTMLElement[];
    const menu = botones.find((b) => b.getAttribute("aria-haspopup") === "menu")!;
    const acciones = botones.filter((b) => b !== menu);
    let tarjeta: HTMLElement | null = f; while (tarjeta && !(parseFloat(getComputedStyle(tarjeta).borderTopWidth) > 0 && parseFloat(getComputedStyle(tarjeta).borderRadius) >= 12)) tarjeta = tarjeta.parentElement as HTMLElement | null;
    const abajo = Math.max(...botones.map((b) => b.getBoundingClientRect().bottom));
    const derecha = Math.max(...botones.map((b) => b.getBoundingClientRect().right));
    return {
      altos: [...new Set(acciones.map((b) => Math.round(b.getBoundingClientRect().height)))],
      letras: [...new Set(acciones.map((b) => getComputedStyle(b).fontSize))],
      menu: `${Math.round(menu.getBoundingClientRect().width)}x${Math.round(menu.getBoundingClientRect().height)}`,
      aireAbajo: Math.round(tarjeta!.getBoundingClientRect().bottom - abajo),
      aireDerecha: Math.round(tarjeta!.getBoundingClientRect().right - derecha),
    };
  });
}

for (const ancho of [1440, 390]) {
  test(`acciones de tarjeta iguales en las secciones del panel (${ancho}px)`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: ancho, height: 900 });
    const medidas: Record<string, Awaited<ReturnType<typeof medir>>> = {};
    for (const cuenta of ["cliente", "pro"] as const) {
      if (cuenta === "cliente") await loginAs(page, "cliente.pruebas@contratacr.test", "ClientePruebas2026!");
      else await loginAs(page, "e2e.pro@contratacr.test", process.env.E2E_TEST_PASSWORD ?? "");
      await page.setViewportSize({ width: ancho, height: 900 });
      for (const s of SECCIONES.filter((x) => x.cuenta === cuenta)) medidas[s.tab] = await medir(page, s.tab);
    }
    const [referencia, ...resto] = Object.values(medidas);
    expect(referencia.altos).toEqual([44]);
    expect(referencia.letras).toEqual(["13px"]);
    expect(referencia.menu).toBe("44x44");
    for (const m of resto) {
      expect(m.altos).toEqual(referencia.altos);
      expect(m.letras).toEqual(referencia.letras);
      expect(m.menu).toBe(referencia.menu);
      expect(Math.abs(m.aireAbajo - referencia.aireAbajo)).toBeLessThanOrEqual(1);
      expect(Math.abs(m.aireDerecha - referencia.aireDerecha)).toBeLessThanOrEqual(1);
    }
  });
}
