import { test, expect } from "playwright/test";
import { gotoOK } from "./helpers";

// Búsqueda unificada (dueño, 22-nov-2026): profesionales y empresas en UN solo resultado, sin pestañas ni
// encabezados separados. Si el texto nombra una sección con empresas, sus tarjetas van INTERCALADAS con las de los
// profesionales (una empresa cada dos profesionales), con el mismo formato, y el mapa lleva sus propios pines.
test("la búsqueda mezcla empresas y profesionales en una sola lista", async ({ page }) => {
  await gotoOK(page, "/buscar?q=farmacias");
  await expect(page.locator("[data-result-tabs]")).toHaveCount(0);
  await expect(page.getByText(/\bLugares\b/)).toHaveCount(0);
  const nota = page.locator("[data-businesses-block]");
  if (await nota.count()) {
    await expect(nota.first()).toContainText(/empresas/i);
    const negocios = page.locator("[data-business-card]");
    await expect(negocios.first()).toBeVisible();
    await expect(negocios.first().locator("article[data-search-item]")).toHaveCount(1);
    // Mismo contenedor de lista que los profesionales (no un bloque aparte).
    const lista = page.locator(".ccr-search-results-list").first();
    await expect(lista.locator("[data-business-card]").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /^Profesionales$/ })).toHaveCount(0);
  }
});
