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

  test(`/negocios-y-profesionales has the two cards [${language}]`, async ({ page }) => {
    await gotoOK(page, `${prefix}/negocios-y-profesionales`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('[data-business-cta="pro"]')).toHaveAttribute("href", `${prefix}/registro/profesional`);
    await expect(page.locator('[data-business-cta="business"]')).toHaveAttribute("href", `${prefix}/lugares`);
    await expect(page.locator("[data-business-card] li")).toHaveCount(6);
    await expectNoHorizontalOverflow(page);
  });
}

// Place sections live INSIDE the themes (no standalone "Lugares" entry): group name -> sections shown in its panel.
const PLACES_BY_GROUP: Record<string, string[]> = {
  Comercios: ["restaurantes", "cafes", "supermercados"],
  Salud: ["salud", "farmacias"],
  "Vehículos": ["gasolineras"],
  Belleza: ["belleza"],
  Mascotas: ["veterinarias"],
  Turismo: ["hospedaje"],
  Empresas: ["bancos"],
};

test("desktop navbar: Categorias mega-menu merges the places into the themes and has its footer row", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "Desktop navigation only");
  await page.setViewportSize({ width: 1366, height: 900 });
  await gotoOK(page, "/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("button", { name: /^Lugares$/ })).toHaveCount(0);
  await header.getByRole("button", { name: /^Categorías$/ }).click();
  const menu = page.getByTestId("services-mega-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: /^Lugares/ })).toHaveCount(0);
  await expect(menu.locator("[data-nav-places-entry]")).toHaveCount(0);
  for (const [group, sections] of Object.entries(PLACES_BY_GROUP)) {
    await menu.getByRole("button", { name: new RegExp(`^${group}`) }).first().hover();
    for (const section of sections) await expect(menu.locator(`[data-nav-directory-section="${section}"]`)).toHaveAttribute("href", `/${section}`);
    await expect(menu.locator("[data-nav-directory-section]")).toHaveCount(sections.length);
  }
  for (const out of ["pulperias", "ferreterias", "tours", "gimnasios", "talleres"]) await expect(menu.locator(`[data-nav-directory-section="${out}"]`)).toHaveCount(0);
  await expect(menu.locator("[data-nav-places-all]")).toHaveCount(0);
  await expect(menu.locator("[data-nav-places-prices]")).toHaveAttribute("href", "/precios");
  await expect(menu.getByRole("link", { name: "Ver todas las categorías" }).last()).toHaveAttribute("href", "/servicios");
  await page.keyboard.press("Escape");
});

test("mobile drawer: Categorias accordion has the same themes with the places inside", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), "Mobile navigation only");
  await gotoOK(page, "/");
  await page.getByRole("button", { name: /Abrir men[uú]|Open menu/i }).first().click();
  const drawer = page.getByRole("dialog", { name: /Men[uú]|Menu/i });
  await expect(drawer.getByRole("button", { name: /^Categorías$|^Categories$/ })).toBeVisible();
  await drawer.getByRole("button", { name: /^Categorías$|^Categories$/ }).click();
  await expect(drawer.getByRole("button", { name: /^Lugares$|^Places$/ })).toHaveCount(0);
  await drawer.getByRole("button", { name: /^Comercios$/ }).click();
  await expect(drawer.locator("[data-nav-directory-section]")).toHaveCount(3);
  await drawer.getByRole("button", { name: /^Salud$/ }).click();
  await expect(drawer.locator('[data-nav-directory-section="salud"]')).toHaveCount(1);
  await expect(drawer.locator('[data-nav-directory-section="farmacias"]')).toHaveCount(1);
  await expect(drawer.getByRole("link", { name: /Para negocios y profesionales|For businesses and professionals/ })).toHaveAttribute("href", /negocios-y-profesionales/);
});
