import { test, expect } from "playwright/test";
import { expectNoHorizontalOverflow, gotoOK, isMobileProject } from "./helpers";

// IA 2026-11-21 (owner decision): "Lugares" hub, "Para negocios y profesionales" page and the Categorias menu.
// Owner of those two pages in verify-app-surface-ownership.mjs. Needs the directory ON (DIR_ENABLED): without it the
// hubs answer 404 and the navbar keeps the classic "Explorar" menu (covered by public-smoke).
for (const language of ["es", "en"] as const) {
  const prefix = language === "en" ? "/en" : "";

  test(`/lugares lists the six groups with links to the sections [${language}]`, async ({ page }) => {
    await gotoOK(page, `${prefix}/lugares`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const groups = page.locator("[data-places-hub-group]");
    expect(await groups.count()).toBeGreaterThan(0);
    await expect(page.locator('[data-places-hub-section="restaurantes"]')).toHaveAttribute("href", `${prefix}/restaurantes`);
    await expect(page.locator("[data-places-hub-prices]")).toHaveAttribute("href", `${prefix}/precios`);
    await expect(page.locator("[data-places-hub-events]")).toHaveAttribute("href", `${prefix}/eventos`);
    await expectNoHorizontalOverflow(page);
  });

  test(`/negocios-y-profesionales no longer exists: old links go to the professional registration [${language}]`, async ({ page }) => {
    await page.goto(`${prefix}/negocios-y-profesionales`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`${prefix}/registro/profesional$`));
  });
}

// Place sections live INSIDE the themes (no standalone "Lugares" entry): group name -> sections shown in its panel.
const PLACES_BY_GROUP: Record<string, string[]> = {
  Comercios: ["restaurantes", "cafes", "supermercados", "pulperias", "ferreterias"],
  Salud: ["salud", "farmacias"],
  Bienestar: ["gimnasios"],
  "Vehículos": ["gasolineras", "talleres"],
  Belleza: ["belleza"],
  Mascotas: ["veterinarias"],
  Turismo: ["hospedaje", "tours"],
  Empresas: ["bancos"],
};

test("desktop navbar: Categorías is a link to the full page, with no dropdown and no business entry", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "Desktop navigation only");
  await page.setViewportSize({ width: 1366, height: 900 });
  await gotoOK(page, "/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("button", { name: /^Lugares$/ })).toHaveCount(0);
  await expect(header.locator("[data-nav-business]")).toHaveCount(0);
  const link = header.getByRole("link", { name: /^Categorías$/ });
  await expect(link).toHaveAttribute("href", "/servicios");
  await link.click();
  await expect(page).toHaveURL(/\/servicios$/);
  await expect(page.getByTestId("services-mega-menu")).toHaveCount(0);
  // The page itself lists the places inside their themes, next to the services.
  for (const [group, sections] of Object.entries(PLACES_BY_GROUP)) {
    await page.getByTestId("services-group-option").filter({ hasText: new RegExp(`^${group}`) }).first().click();
    for (const section of sections) await expect(page.locator(`[data-nav-directory-section="${section}"]`)).toHaveAttribute("href", `/${section}`);
    await expect(page.locator("[data-nav-directory-section]")).toHaveCount(sections.length);
  }
});

test("mobile drawer: Categorías is a plain link to the full page and there is no business entry", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), "Mobile navigation only");
  await gotoOK(page, "/");
  await page.getByRole("button", { name: /Abrir men[uú]|Open menu/i }).first().click();
  const drawer = page.getByRole("dialog", { name: /Men[uú]|Menu/i });
  await expect(drawer.getByRole("link", { name: /^Categorías$|^Categories$/ })).toHaveAttribute("href", /\/servicios$/);
  await expect(drawer.getByRole("button", { name: /^Categorías$|^Categories$/ })).toHaveCount(0);
  await expect(drawer.getByRole("link", { name: /Para negocios y profesionales|For businesses and professionals/ })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: /^Lugares$|^Places$/ })).toHaveCount(0);
});
