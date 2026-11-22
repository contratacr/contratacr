import { test, expect } from "playwright/test";
import { gotoOK } from "./helpers";

// Búsqueda unificada (dueño, 22-nov-2026): profesionales y negocios en UN solo resultado, sin pestañas
// "Servicios | Lugares". Si el texto nombra una sección con negocios, aparecen bajo "Negocios" en la misma lista.
test("la búsqueda no separa profesionales y negocios en pestañas", async ({ page }) => {
  await gotoOK(page, "/buscar?q=farmacias");
  await expect(page.locator("[data-result-tabs]")).toHaveCount(0);
  const bloque = page.locator("[data-businesses-block]");
  if (await bloque.count()) {
    await expect(bloque.getByRole("heading", { level: 2, name: /Empresas/ })).toBeVisible();
    await expect(bloque.locator("article[data-search-item]").first()).toBeVisible();
    await expect(page.getByText(/\bLugares\b/)).toHaveCount(0);
  }
});
