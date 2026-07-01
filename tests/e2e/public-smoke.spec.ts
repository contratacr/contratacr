import { expect, test } from "playwright/test";
import { expectNoHorizontalOverflow, expectPageShell, gotoOK, isMobileProject } from "./helpers";

const routes = [
  "/es",
  "/es/servicios",
  "/es/buscar",
  "/es/login",
  "/es/soporte",
  "/en",
  "/en/servicios",
  "/en/buscar",
  "/en/login",
  "/en/soporte",
];

test.describe("@smoke public routes", () => {
  for (const route of routes) {
    test(`${route} renders a healthy page`, async ({ page }) => {
      await gotoOK(page, route);
      await expectPageShell(page);
      await expectNoHorizontalOverflow(page);
    });
  }

  test("navbar exposes the core public actions", async ({ page }, testInfo) => {
    await gotoOK(page, "/es");
    await expect(page.getByRole("link", { name: /ContrataCR/i }).first()).toBeVisible();

    if (isMobileProject(testInfo)) {
      await page.getByRole("button", { name: /Abrir menu|Abrir men/i }).first().click();
      await expect(page.getByRole("link", { name: /^Servicios$/i }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: /Soporte|Centro de ayuda/i }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: /Ingresar/i }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: /Ofrecer mis servicios/i }).first()).toBeVisible();
    } else {
      await expect(page.getByRole("button", { name: /^Servicios$/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^Recursos$/i }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: /Ingresar/i }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: /Ofrecer mis servicios/i }).first()).toBeVisible();
    }
  });
});
