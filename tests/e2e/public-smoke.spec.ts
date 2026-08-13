import { expect, test } from "playwright/test";
import { expectHealthyPage, expectPageShell, gotoOK, isMobileProject, waitForInteractivePage } from "./helpers";

const routes = [
  "/es",
  "/es/categorias",
  "/es/servicios",
  "/es/buscar",
  "/es/empleos",
  "/es/ofertas",
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
  "/en/empleos",
  "/en/ofertas",
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
    await waitForInteractivePage(page);
    await expect(page.getByRole("link", { name: /ContrataCR/i }).first()).toBeVisible();

    if (isMobileProject(testInfo)) {
      await page.getByRole("button", { name: /Abrir menu|Abrir men/i }).first().click();
      const navigation = page.getByRole("dialog", { name: /Men[uú]|Menu/i });
      await expect(page.getByRole("link", { name: /^Servicios$/i }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: /Soporte|Centro de ayuda/i }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: /Ingresar/i }).first()).toBeVisible();
      const offerServices = navigation.getByRole("link", { name: /Ofrecer mis servicios/i }).first();
      await expect(offerServices).toBeVisible();
      await expect(offerServices.locator("svg")).toHaveCount(0);
      await expect(offerServices).toHaveCSS("color", "rgb(0, 159, 217)");
    } else {
      const navigation = page.getByRole("banner");
      await expect(navigation.getByRole("button", { name: /^Servicios$/i }).first()).toBeVisible();
      await expect(navigation.getByRole("button", { name: /^Explorar$/i }).first()).toBeVisible();
      await expect(navigation.getByRole("link", { name: /Ingresar/i }).first()).toBeVisible();
      const offerServices = navigation.getByRole("link", { name: /Ofrecer mis servicios/i }).first();
      await expect(offerServices).toBeVisible();
      await expect(offerServices.locator("svg")).toHaveCount(0);
      await expect(offerServices).toHaveCSS("color", "rgb(0, 159, 217)");
    }
    await expectHealthyPage(page);
  });

  test("home near-me search uses proximity params", async ({ page }, testInfo) => {
    await page.context().setGeolocation({ latitude: 9.9281, longitude: -84.0907 });
    await gotoOK(page, "/es");
    await waitForInteractivePage(page);
    await page.context().grantPermissions(["geolocation"], { origin: new URL(page.url()).origin });

    const location = page
      .getByPlaceholder(/Ubicaci[oó]n|Location/i)
      .filter({ visible: true })
      .first();
    await location.fill("San");

    const nearMe = page
      .getByRole("button", { name: /Buscar cerca de m[ií]|Search near me/i })
      .filter({ visible: true })
      .first();
    await expect(nearMe).toBeVisible();

    await nearMe.click();
    if (isMobileProject(testInfo)) {
      await expect(location).toHaveValue(/Cerca de m[ií]|Near me/i);
      await page.getByRole("button", { name: /^Buscar$|^Search$/i }).filter({ visible: true }).first().click();
    }
    await expect(page).toHaveURL(/\/es\/buscar/);
    await expect(page).toHaveURL(/lat=9\.92810/);
    await expect(page).toHaveURL(/lng=-84\.09070/);
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

    await expect(megaMenu.getByRole("heading", { name: /^Hogar$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Plomer/i }).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/servicesPage\./i);
    await expectHealthyPage(page);
  });

  test("services search uses the canonical design and art label", async ({ page }, testInfo) => {
    await gotoOK(page, "/es/servicios");
    await waitForInteractivePage(page);
    const pageSearch = page
      .getByTestId(isMobileProject(testInfo) ? "services-page-mobile-search" : "services-page-search")
      .locator("input");
    await expect(pageSearch).toBeVisible();
    await pageSearch.fill("diseño");

    await expect(page.locator("main").getByText("Diseño y arte", { exact: true }).filter({ visible: true }).first()).toBeVisible();
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

  test("footer keeps localized resources and safe external destinations", async ({ page }) => {
    for (const locale of ["es", "en"] as const) {
      await gotoOK(page, `/${locale}`);
      const footer = page.locator("footer");
      await expect(footer).toBeVisible();

      const internalRoutes = ["servicios", "como-funciona", "ayuda", "soporte", "privacidad", "terminos"];
      for (const route of internalRoutes) {
        await expect(footer.locator(`a[href="/${locale}/${route}"]`).first(), `Missing /${locale}/${route} in footer`).toBeVisible();
      }

      const external = footer.locator('a[target="_blank"]');
      const count = await external.count();
      for (let index = 0; index < count; index += 1) {
        await expect(external.nth(index)).toHaveAttribute("rel", /noopener|noreferrer/);
      }
      await expectHealthyPage(page);
    }
  });
});
