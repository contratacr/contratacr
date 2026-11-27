import { test, expect } from "playwright/test";
import { directoryEnabled, gotoOK, isMobileProject } from "./helpers";

// Búsqueda unificada (dueño, 22-nov-2026): profesionales y empresas en UN solo resultado, sin pestañas ni
// encabezados separados. Si el texto nombra una sección con empresas, sus tarjetas van INTERCALADAS con las de los
// profesionales (una empresa cada dos profesionales), con el mismo formato, y el mapa lleva sus propios pines.
test("la búsqueda mezcla empresas y profesionales en una sola lista", async ({ page }) => {
  await gotoOK(page, "/buscar?q=farmacias");
  await expect(page.locator("[data-result-tabs]")).toHaveCount(0);
  await expect(page.getByText(/\bLugares\b/)).toHaveCount(0);
  const nota = page.locator("[data-businesses-block]");
  if (await nota.count()) {
    // The note names the section since 8fab64479 (2026-11-26, Yelp naming): «Incluye resultados de Farmacias».
    await expect(nota.first()).toContainText(/Incluye resultados de Farmacias/);
    // Directory on, phones: a place search shows the app rows («Mejores resultados», directory-app-search.spec.ts)
    // and the interleaved business cards stay for the computer layout.
    if (isMobileProject(test.info()) && await directoryEnabled(page.request)) {
      await expect(page.locator("[data-app-place-results] [data-place-row]").first()).toBeVisible();
      return;
    }
    const negocios = page.locator("[data-business-card]");
    await expect(negocios.first()).toBeVisible();
    await expect(negocios.first().locator("article[data-search-item]")).toHaveCount(1);
    // Mismo contenedor de lista que los profesionales (no un bloque aparte).
    const lista = page.locator(".ccr-search-results-list").first();
    await expect(lista.locator("[data-business-card]").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /^Profesionales$/ })).toHaveCount(0);
  }
});
