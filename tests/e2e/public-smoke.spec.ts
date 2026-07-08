import { expect, test } from "playwright/test";
import { expectHealthyPage, expectPageShell, gotoOK, isMobileProject, waitForInteractivePage } from "./helpers";

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

  test("home near-me search uses the app tooltip and proximity params", async ({ page }, testInfo) => {
    await page.context().setGeolocation({ latitude: 9.9281, longitude: -84.0907 });
    await gotoOK(page, "/es");
    await waitForInteractivePage(page);
    await page.context().grantPermissions(["geolocation"], { origin: new URL(page.url()).origin });

    const nearMe = page.getByTestId("landing-near-me").filter({ visible: true }).first();
    await expect(nearMe).toBeVisible();
    await expect(nearMe).not.toHaveAttribute("title", /.+/);
    await expect(nearMe).toHaveAttribute("aria-label", /Buscar profesionales cerca de m[ií]|Search professionals near me/i);

    if (!isMobileProject(testInfo)) {
      await nearMe.hover();
      await expect(page.getByText(/Cerca de m[ií]|Near me/i).first()).toBeVisible();
    }

    await nearMe.click();
    const homeForm = nearMe.locator("xpath=ancestor::form[1]");
    await expect(
      homeForm.locator('input[placeholder="Ubicación"], input[placeholder="Location"]').filter({ visible: true }).first(),
    ).toHaveValue(/Cerca de m[ií]|Near me/i);
    await homeForm.getByRole("button", { name: /^Buscar$|^Search$/ }).click();

    await expect(page).toHaveURL(/\/es\/buscar/);
    await expect(page).toHaveURL(/lat=9\.92810/);
    await expect(page).toHaveURL(/lng=-84\.09070/);
    await expect(page).toHaveURL(/sortBy=cercania/);
  });

  test("services navigation keeps the matching section context", async ({ page }, testInfo) => {
    await gotoOK(page, "/es");
    await waitForInteractivePage(page);

    if (isMobileProject(testInfo)) {
      await page.getByRole("button", { name: /Abrir menu|Abrir men/i }).first().click();
      await expect(page.getByRole("link", { name: /^Servicios$/i }).first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/servicesPage\./i);
      await expectHealthyPage(page);
      return;
    }

    await page.getByRole("button", { name: /^Servicios$/i }).first().click();
    const megaMenu = page.getByTestId("services-mega-menu");
    await expect(megaMenu).toBeVisible();
    const menuSearch = megaMenu.getByTestId("services-mega-menu-search");
    await expect(menuSearch).toBeVisible();
    await menuSearch.fill("Plomer");

    await expect(page.getByText(/Hogar y construcci/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Plomer/i }).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/servicesPage\./i);
    await expectHealthyPage(page);
  });

  test("services search uses the canonical design and art label", async ({ page }, testInfo) => {
    await gotoOK(page, "/es/servicios");
    await waitForInteractivePage(page);
    const pageSearch = page.locator('[data-testid="services-page-search"] input').first();
    await expect(pageSearch).toBeVisible();
    await pageSearch.fill("diseño");

    await expect(page.getByText("Diseño y arte").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Diseño\s*\/\s*Arte|Diseno/i);
    await expectHealthyPage(page);

    if (!isMobileProject(testInfo)) {
      await gotoOK(page, "/es");
      await waitForInteractivePage(page);
      await page.getByRole("button", { name: /^Servicios$/i }).first().click();
      const megaMenu = page.getByTestId("services-mega-menu");
      await expect(megaMenu).toBeVisible();
      const menuSearch = megaMenu.getByTestId("services-mega-menu-search");
      await expect(menuSearch).toBeVisible();
      await menuSearch.fill("diseño");

      await expect(page.getByRole("button", { name: /Diseño y arte/i }).first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/Diseño\s*\/\s*Arte|Diseno/i);
      await expectHealthyPage(page);
    }
  });
});
