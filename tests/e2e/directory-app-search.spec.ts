import { test, expect, type Page } from "playwright/test";
import { gotoOK, waitForInteractivePage } from "./helpers";

// App search tab (Yelp model, our colours): mobile home, "Más categorías", search entry, results chips and rows.
// Mobile parts run only below lg; at lg and up the desktop landing must stay as it was. Place data may be missing in
// a fixture-less run: the row assertions then fall back to the empty state, which is part of the contract.

const mobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;
const directoryOn = async (page: Page) => (await page.locator("[data-app-home-slot], [data-results-title-row]").count()) > 0;

for (const locale of ["es", "en"] as const) {
  const p = (path: string) => (locale === "en" ? `/en${path === "/" ? "" : path}` : path);
  const es = locale === "es";

  test.describe(`app search ${locale}`, () => {
    test("home: icon row, rotating pill and top 10 band on phones; desktop landing untouched", async ({ page }) => {
      await gotoOK(page, p("/"));
      await waitForInteractivePage(page);
      test.skip(!(await directoryOn(page)), "directory flag is off");
      if (!mobile(page)) {
        await expect(page.locator("[data-app-home]")).toBeHidden();
        await expect(page.locator("main h1").filter({ visible: true }).first()).toBeVisible();
        return;
      }
      const home = page.locator("[data-app-home]");
      await expect(home).toBeVisible();
      for (const key of ["restaurantes", "talleres", "mudanzas", "plomeros", "limpieza", "mas"]) await expect(home.locator(`[data-home-tile="${key}"]`)).toBeVisible();
      await expect(home.locator('[data-home-tile="restaurantes"]')).toContainText(es ? "Restaurantes" : "Restaurants");
      await expect(home.locator('[data-home-tile="talleres"]')).toContainText(es ? "Taller mecánico" : "Auto repair");
      const first = await home.locator("[data-home-placeholder]").innerText();
      expect(first).toMatch(es ? /^Buscar / : /^Search /);
      await expect.poll(async () => home.locator("[data-home-placeholder]").innerText(), { timeout: 8_000 }).not.toBe(first);
      await expect(home.locator("[data-home-top10]")).toContainText(es ? "Desbloquee su top 10" : "Unlock your top 10");
      await home.locator("[data-home-top10-info]").click();
      await expect(home.locator("[data-home-top10-tip]")).toContainText(es ? "analizamos aportes, calificaciones, volumen de reseñas y opinión de la comunidad" : "ratings, review volume");
    });

    test("Más opens Más categorías with its groups and the in-app links", async ({ page }) => {
      await gotoOK(page, p("/"));
      await waitForInteractivePage(page);
      test.skip(!(await directoryOn(page)) || !mobile(page), "phones with the directory on");
      await page.locator('[data-home-tile="mas"]').click();
      const sheet = page.locator("[data-more-sheet]");
      await expect(sheet.getByRole("heading", { level: 1 })).toHaveText(es ? "Más categorías" : "More categories");
      for (const id of ["populares", "snacks", "spas", "autos", "mas"]) await expect(sheet.locator(`[data-more-group="${id}"]`)).toBeVisible();
      await expect(sheet.locator('[data-more-group="populares"]')).toContainText(es ? "Contadores" : "Accountants");
      await expect(sheet.locator('[data-more-group="mas"]')).toContainText(es ? "Más en ContrataCR" : "More on ContrataCR");
      for (const k of ["profesionales", "empleos", "promociones", "solicitudes"]) await expect(sheet.locator(`[data-more-row="${k}"]`)).toBeVisible();
      await sheet.locator("[data-more-back]").click();
      await expect(sheet).toBeHidden();
    });

    test("search entry: location, recents, trending and suggestions with prices and availability first", async ({ page }) => {
      await gotoOK(page, p("/"));
      await waitForInteractivePage(page);
      test.skip(!(await directoryOn(page)) || !mobile(page), "phones with the directory on");
      await page.locator("[data-home-search-open]").click();
      const entry = page.locator("[data-search-entry]");
      await expect(entry).toBeVisible();
      await expect(entry.locator("[data-search-current-location]")).toHaveText(es ? "Ubicación actual" : "Current location");
      await expect(entry.getByPlaceholder(es ? "barrio, ciudad, provincia o código postal" : "neighborhood, city, province or postal code")).toBeVisible();
      await expect(entry.locator("[data-search-trending]")).toContainText(es ? "Búsquedas en tendencia" : "Trending searches");
      await entry.locator("[data-search-input]").fill(es ? "plomeros" : "plumbers");
      const first = entry.locator("[data-suggestion]").first();
      await expect(first).toContainText(es ? "- Precios y disponibilidad" : "- Prices and availability");
      await expect(entry.locator("[data-suggestion]").nth(1)).toHaveText(es ? "plomeros" : "plumbers");
      await expect(entry.locator("[data-suggestion]", { hasText: es ? "Reparación" : "Repair" })).toBeVisible();
      await first.click();
      await expect(page).toHaveURL(/\/(buscar|profesionales)\?q=/);
    });

    test("recent searches are kept in the browser and can be removed", async ({ page }) => {
      await gotoOK(page, p("/"));
      await waitForInteractivePage(page);
      test.skip(!(await directoryOn(page)) || !mobile(page), "phones with the directory on");
      await page.evaluate(() => window.localStorage.setItem("ccr-search-recents", JSON.stringify([{ termino: "cerrajeros", at: Date.now() }])));
      await page.locator("[data-home-search-open]").click();
      const recents = page.locator("[data-search-recents]");
      await expect(recents).toContainText("cerrajeros");
      await recents.getByRole("button", { name: /cerrajeros/ }).last().click();
      await expect(recents).toBeHidden();
    });

    test("results of a place search: chips, sort sheet with four radios, rows or the empty state, never sponsored filler", async ({ page }) => {
      await gotoOK(page, p("/buscar?q=restaurantes"));
      await waitForInteractivePage(page);
      test.skip(!(await directoryOn(page)) || !mobile(page), "phones with the directory on");
      const chips = page.locator('[data-result-chips="place"]');
      await expect(chips).toBeVisible();
      await expect(chips.locator('[data-chip="sort"]')).toContainText(es ? "Ordenar" : "Sort");
      await expect(chips.locator('[data-chip="open-now"]')).toContainText(es ? "Abierto ahora" : "Open now");
      await expect(chips.locator('[data-chip="price"]')).toContainText(es ? "Precio" : "Price");
      await expect(chips.locator('[data-chip="takeout"]')).toContainText(es ? "Ofrece para llevar" : "Offers takeout");
      await expect(page.locator("[data-results-title-row]")).toContainText(es ? "Restaurantes" : "Restaurants");
      await chips.locator('[data-chip="sort"]').click();
      await expect(page.locator('[data-chip-sheet] [role="radio"]')).toHaveCount(4);
      await page.locator("[data-chip-sheet]").getByRole("button", { name: es ? "Cerrar" : "Close" }).click();
      const rows = page.locator("[data-app-place-results] [data-place-row]");
      if ((await rows.count()) > 0) {
        await expect(page.locator("[data-app-place-results] h2").first()).toHaveText(es ? "Mejores resultados" : "Top results");
        await expect(rows.first().locator("[data-row-name]")).toContainText(/^1\. /);
        await expect(rows.first().locator("[data-row-meta]")).toContainText(es ? /Abierto|Cerrado|₡|\S/ : /Open|Closed|₡|\S/);
        const cta = rows.first().locator("[data-place-action], [data-place-contact]");
        await expect(cta.first()).toBeVisible();
      } else {
        await expect(page.locator("[data-place-empty]")).toContainText(es ? "Sin resultados para: restaurantes" : "No results for: restaurantes");
        await expect(page.locator("[data-add-business]").first()).toContainText(es ? "Agregar negocio" : "Add business");
      }
      await expect(page.locator("body")).not.toContainText(/Patrocinado|Sponsored/);
    });

    test("results of a service search: assistant card and service chips; no sponsored sections without promoted data", async ({ page }) => {
      await gotoOK(page, p("/buscar?categoria=plomeria"));
      await waitForInteractivePage(page);
      test.skip(!(await directoryOn(page)) || !mobile(page), "phones with the directory on");
      await expect(page.locator("[data-service-assistant]")).toContainText(es ? "¿en qué le podemos ayudar hoy?" : "how can we help you today?");
      await expect(page.locator("[data-service-assistant]")).toContainText(es ? "El asistente le conectará con profesionales locales" : "The assistant will connect you with local professionals");
      await expect(page.locator('[data-chip="quote"]').first()).toContainText(es ? "Solicitar cotización" : "Request a quote");
      await expect(page.locator('[data-chip="more"]').first()).toContainText(es ? "Más filtros" : "More filters");
      await page.locator("[data-service-assistant] input").fill("fuga en el baño");
      await page.locator("[data-service-assistant] button[type=submit]").click();
      await expect(page).toHaveURL(/\/asistente/);
    });

    test("deep links keep resolving", async ({ page }) => {
      for (const path of ["/restaurantes", "/servicios", "/lugares", "/buscar?categoria=plomeria", "/buscar?q=farmacias"]) {
        await gotoOK(page, p(path));
      }
    });
  });
}

test("desktop: results keep the professional list and no assistant card or place rows", async ({ page }) => {
  await gotoOK(page, "/buscar?q=restaurantes");
  await waitForInteractivePage(page);
  test.skip(mobile(page), "desktop only");
  await expect(page.locator("[data-service-assistant]")).toBeHidden();
  await expect(page.locator("[data-app-place-results]")).toBeHidden();
});
