import { test, expect } from "playwright/test";
import { expectNoHorizontalOverflow, gotoOK, isMobileProject } from "./helpers";

// IA 2026-11-21 (owner decision): "Lugares" hub, "Para negocios y profesionales" page and the Lugares / Mas menus.
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

test("desktop navbar: Lugares menu shows the groups and its footer row", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "Desktop navigation only");
  await page.setViewportSize({ width: 1366, height: 900 });
  await gotoOK(page, "/");
  const header = page.getByRole("banner");
  await header.locator("[data-nav-places-trigger]").click();
  const menu = page.locator("[data-nav-places]");
  await expect(menu).toBeVisible();
  expect(await menu.locator("[data-nav-places-group]").count()).toBeGreaterThan(0);
  await expect(menu.locator("[data-nav-places-all]")).toHaveAttribute("href", "/lugares");
  await expect(menu.locator("[data-nav-places-prices]")).toHaveAttribute("href", "/precios");
  await page.keyboard.press("Escape");
  await expect(header.getByRole("link", { name: "Para negocios y profesionales" })).toHaveAttribute("href", "/negocios-y-profesionales");
});

test("mobile drawer: Servicios and Lugares are the first rows", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), "Mobile navigation only");
  await gotoOK(page, "/");
  await page.getByRole("button", { name: /Abrir men[uú]|Open menu/i }).first().click();
  const drawer = page.getByRole("dialog", { name: /Men[uú]|Menu/i });
  const rows = drawer.locator("nav > a, nav > div > button, nav > button");
  await expect(rows.nth(0)).toHaveText(/Servicios|Services/);
  await expect(rows.nth(1)).toHaveText(/Lugares|Places/);
  await rows.nth(1).click();
  await expect(drawer.locator("[data-nav-places-group]").first()).toBeVisible();
});
