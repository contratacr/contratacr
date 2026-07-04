import { expect, test } from "playwright/test";
import { expectHealthyPage, expectPageShell, gotoOK, isMobileProject } from "./helpers";

const routes = [
  "/es",
  "/es/categorias",
  "/es/servicios",
  "/es/buscar",
  "/es/login",
  "/es/registro",
  "/es/registro/cliente",
  "/es/registro/profesional",
  "/es/olvide-contrasena",
  "/es/soporte",
  "/es/ayuda",
  "/es/contacto",
  "/es/como-funciona",
  "/es/atraer-clientes",
  "/es/publicar-proyecto",
  "/es/proveedores-autorizados",
  "/es/privacidad",
  "/es/terminos",
  "/en",
  "/en/categorias",
  "/en/servicios",
  "/en/buscar",
  "/en/login",
  "/en/registro",
  "/en/registro/cliente",
  "/en/registro/profesional",
  "/en/olvide-contrasena",
  "/en/soporte",
  "/en/ayuda",
  "/en/contacto",
  "/en/como-funciona",
  "/en/atraer-clientes",
  "/en/publicar-proyecto",
  "/en/proveedores-autorizados",
  "/en/privacidad",
  "/en/terminos",
];

test.describe("@smoke public routes", () => {
  for (const route of routes) {
    test(`${route} renders a healthy page`, async ({ page }) => {
      await gotoOK(page, route);
      await expectPageShell(page);
      await expectHealthyPage(page);
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
    await expectHealthyPage(page);
  });

  test("services navigation keeps the matching section context", async ({ page }, testInfo) => {
    await gotoOK(page, "/es");

    if (isMobileProject(testInfo)) {
      await page.getByRole("button", { name: /Abrir menu|Abrir men/i }).first().click();
      await expect(page.getByRole("link", { name: /^Servicios$/i }).first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/servicesPage\./i);
      await expectHealthyPage(page);
      return;
    }

    await page.getByRole("button", { name: /^Servicios$/i }).first().hover();
    const menuSearch = page.locator('input[aria-label*="servicio" i], input[placeholder*="servicio" i]').first();
    await expect(menuSearch).toBeVisible();
    await menuSearch.fill("Plomer");

    await expect(page.getByText(/Hogar y construcci/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Plomer/i }).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/servicesPage\./i);
    await expectHealthyPage(page);
  });

  test("services search uses the canonical design and art label", async ({ page }, testInfo) => {
    await gotoOK(page, "/es/servicios");
    const pageSearch = page.locator('[data-testid="services-page-search"] input').first();
    await pageSearch.fill("diseño");

    await expect(page.getByText("Diseño y arte").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Diseño\s*\/\s*Arte|Diseno/i);
    await expectHealthyPage(page);

    if (!isMobileProject(testInfo)) {
      await gotoOK(page, "/es");
      await page.getByRole("button", { name: /^Servicios$/i }).first().hover();
      const menuSearch = page.locator('input[aria-label*="servicio" i], input[placeholder*="servicio" i]').first();
      await expect(menuSearch).toBeVisible();
      await menuSearch.fill("diseño");

      await expect(page.getByRole("button", { name: /Diseño y arte/i }).first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/Diseño\s*\/\s*Arte|Diseno/i);
      await expectHealthyPage(page);
    }
  });
});
