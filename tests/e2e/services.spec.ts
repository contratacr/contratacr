import { expect, test, type Page } from "playwright/test";
import { expectHealthyPage, gotoOK, isMobileProject, waitForInteractivePage } from "./helpers";

function servicesSearch(page: Page, mobile: boolean) {
  return page
    .getByTestId(mobile ? "services-page-mobile-search" : "services-page-search")
    .locator("input");
}

test.describe("@smoke services catalog", () => {
  test("service search finds a known service without leaving the page", async ({ page }, testInfo) => {
    await gotoOK(page, "/es/servicios");
    await waitForInteractivePage(page);

    const search = servicesSearch(page, isMobileProject(testInfo));
    await search.fill("Plomer");
    const result = page.locator("main").getByRole("link", { name: /Plomer[ií]a/i }).filter({ visible: true }).first();
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute("href", /\/es\/buscar\?categoria=plomeria/);

    await search.fill("");
    await expect(search).toHaveValue("");
    await expect(page).toHaveURL(/\/es\/servicios\/?\??$/);
    await expect(page.locator("body")).not.toContainText(/servicesPage\./i);
    await expectHealthyPage(page);
  });

  test("unknown service shows one consistent suggestion CTA", async ({ page }, testInfo) => {
    await gotoOK(page, "/es/servicios");
    await waitForInteractivePage(page);

    const search = servicesSearch(page, isMobileProject(testInfo));
    await search.fill(`Servicio inexistente ${Date.now()}`);

    await expect(page.locator("main").getByText(/No ves tu servicio|No encontramos ese servicio/i).filter({ visible: true }).first()).toBeVisible();
    await expect(page.locator("main").getByText(/Cuentanos que servicio|Cu.ntanos qu. servicio|Tell us what service/i).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Sugerir servicio|Suggest a service/i }).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/servicesPage\./i);
    await expectHealthyPage(page);
  });

  test("ungrouped approved services are not exposed as Otras categorías", async ({ page }) => {
    await page.route("**/api/categories/approved", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          categories: [
            {
              id: "servicio_especial_e2e",
              label: "Servicio especial E2E",
              labelEn: "E2E special service",
              isHidden: false,
              esSalud: false,
              supportsVideoconsulta: false,
            },
          ],
          categoryFlags: [],
          groups: [],
        }),
      });
    });

    await gotoOK(page, "/es/servicios");
    await waitForInteractivePage(page);

    const groupOptions = page.getByTestId("services-group-option");
    await expect(groupOptions.filter({ hasText: /Otras categor/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Servicio especial E2E/i })).toHaveCount(0);
    await expectHealthyPage(page);
  });

  test("Moda y Turismo use distinct service group icons", async ({ page }, testInfo) => {
    await gotoOK(page, "/es/servicios");
    await waitForInteractivePage(page);

    const groups = page.getByTestId(isMobileProject(testInfo) ? "services-mobile-group-option" : "services-group-option");
    if (isMobileProject(testInfo)) {
      await expect(groups.filter({ hasText: /Moda/i }).first()).toBeVisible();
      await expect(groups.filter({ hasText: /Turismo/i }).first()).toBeVisible();
      await expectHealthyPage(page);
      return;
    }
    const fashionIcon = await groups.filter({ hasText: /Moda/i }).locator("svg").first().evaluate((svg) => svg.innerHTML);
    const tourismIcon = await groups.filter({ hasText: /Turismo/i }).locator("svg").first().evaluate((svg) => svg.innerHTML);

    expect(fashionIcon).not.toBe(tourismIcon);
    await expectHealthyPage(page);
  });

  test("selected service groups do not create a large empty gap before the service list", async ({ page }, testInfo) => {
    await gotoOK(page, "/es/servicios");
    await waitForInteractivePage(page);

    const mobile = isMobileProject(testInfo);
    const target = page
      .getByTestId(mobile ? "services-mobile-group-option" : "services-group-option")
      .filter({ hasText: /Eventos|Seguridad|Technology|Events/i })
      .first();
    await target.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo({ top: 500, behavior: "auto" }));
    if (mobile) {
      await target.click();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(10);
      const title = page.getByRole("heading", { name: /Eventos|Seguridad|Technology|Events/i }).first();
      const firstService = page.getByRole("link", { name: /Todos los servicios de|All .* services/i }).first();
      await expect(title).toBeVisible();
      await expect(firstService).toBeVisible();

      const headerBox = await page.locator("main header").first().boundingBox();
      const serviceBox = await firstService.boundingBox();
      expect(headerBox, "Mobile services header should have a bounding box").not.toBeNull();
      expect(serviceBox, "First mobile service should have a bounding box").not.toBeNull();
      expect(serviceBox!.y - (headerBox!.y + headerBox!.height), "The mobile service list should begin directly below its header.").toBeLessThan(40);
    } else {
      const groupBox = await target.boundingBox();
      await target.click();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(10);
      const title = page.getByRole("heading", { name: /Eventos|Seguridad|Technology|Events/i }).last();
      await expect(title).toBeVisible();
      const titleBox = await title.boundingBox();

      expect(groupBox, "Selected group should have a bounding box").not.toBeNull();
      expect(titleBox, "Selected group title should have a bounding box").not.toBeNull();
      expect(
        titleBox!.y - (groupBox!.y + groupBox!.height),
        "The service list should start close to the selected group.",
      ).toBeLessThan(180);
    }
    await expectHealthyPage(page);
  });
});
