import { expect, test } from "playwright/test";
import { expectHealthyPage, gotoOK, waitForInteractivePage } from "./helpers";

test.describe("@smoke services catalog", () => {
  test("service search finds a known service without leaving the page", async ({ page }) => {
    await gotoOK(page, "/es/servicios");
    await waitForInteractivePage(page);

    const search = page.getByTestId("services-page-search").locator("input");
    await search.fill("Plomer");
    await expect(page.getByText(/Plomer/i).first()).toBeVisible();
    await expect(page.getByText(/Hogar y construcci/i).first()).toBeVisible();

    await search.fill("");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/es\/servicios\/?\??$/);
    await expect(page.locator("body")).not.toContainText(/servicesPage\./i);
    await expectHealthyPage(page);
  });

  test("unknown service shows one consistent suggestion CTA", async ({ page }) => {
    await gotoOK(page, "/es/servicios");
    await waitForInteractivePage(page);

    const search = page.getByTestId("services-page-search").locator("input");
    await search.fill(`Servicio inexistente ${Date.now()}`);

    await expect(page.getByText(/No ves tu servicio|No encontramos ese servicio/i).first()).toBeVisible();
    await expect(page.getByText(/Cuentanos que servicio|Cu.ntanos qu. servicio|Tell us what service/i).first()).toBeVisible();
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
});
