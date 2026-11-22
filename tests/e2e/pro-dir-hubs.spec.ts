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

test("desktop navbar: Categorias mega-menu has the curated Lugares block and its footer row", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "Desktop navigation only");
  await page.setViewportSize({ width: 1366, height: 900 });
  await gotoOK(page, "/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("button", { name: /^Lugares$/ })).toHaveCount(0);
  await header.getByRole("button", { name: /^Categorías$/ }).click();
  const menu = page.getByTestId("services-mega-menu");
  await expect(menu).toBeVisible();
  await menu.locator("[data-nav-places-entry] button").hover();
  const places = menu.locator("[data-nav-places]");
  await expect(places).toBeVisible();
  await expect(places.locator("[data-nav-directory-section]")).toHaveCount(10);
  await expect(places.locator('[data-nav-directory-section="pulperias"]')).toHaveCount(0);
  await expect(menu.locator("[data-nav-places-all]").last()).toHaveAttribute("href", "/lugares");
  await expect(menu.locator("[data-nav-places-prices]")).toHaveAttribute("href", "/precios");
  await expect(menu.getByRole("link", { name: "Ver todas las categorías" })).toHaveAttribute("href", "/servicios");
  await page.keyboard.press("Escape");
});

test("mobile drawer: Categorias accordion holds the curated Lugares block", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), "Mobile navigation only");
  await gotoOK(page, "/");
  await page.getByRole("button", { name: /Abrir men[uú]|Open menu/i }).first().click();
  const drawer = page.getByRole("dialog", { name: /Men[uú]|Menu/i });
  await expect(drawer.getByRole("button", { name: /^Categorías$|^Categories$/ })).toBeVisible();
  await drawer.getByRole("button", { name: /^Categorías$|^Categories$/ }).click();
  await expect(drawer.locator("[data-nav-directory-section]")).toHaveCount(10);
  await expect(drawer.getByRole("link", { name: /Para negocios y profesionales|For businesses and professionals/ })).toHaveAttribute("href", /negocios-y-profesionales/);
});
