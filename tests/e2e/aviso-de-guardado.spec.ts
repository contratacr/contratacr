import { test, expect } from "playwright/test";
import { gotoOK, loginAs } from "./helpers";

// Lo que se guarda solo se confirma A LA VISTA. El acuse de Servicios era una
// línea al final de la lista: con seis servicios, tocar el interruptor del
// primero la pintaba dos pantallas más abajo (y=1853 en una pantalla de 900).
test("apagar el primer servicio confirma «Guardado» dentro de la pantalla", async ({ page }) => {
  await loginAs(page, "e2e.pro@contratacr.test", process.env.E2E_TEST_PASSWORD ?? "");
  await gotoOK(page, "/es/dashboard/profesional?tab=services");
  const interruptor = page.locator("[data-servicio]").first().locator("button[aria-pressed]").first();
  await expect(interruptor).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));

  try {
    await interruptor.click();
    const aviso = page.locator("[data-aviso-guardado]");
    await expect(aviso).toBeVisible();
    await expect(aviso).toBeInViewport({ ratio: 1 });
    await expect(page.locator('[data-aviso-guardado="guardado"]')).toBeVisible();
    // Y se va solo: no es un cartel que haya que cerrar.
    await expect(aviso).toBeHidden({ timeout: 6000 });
  } finally {
    await interruptor.click(); // el servicio queda como estaba
    await page.waitForTimeout(1500);
  }
});
