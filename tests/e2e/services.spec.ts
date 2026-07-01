import { expect, test } from "playwright/test";
import { expectNoHorizontalOverflow, gotoOK } from "./helpers";

test.describe("@smoke services catalog", () => {
  test("service search finds a known service without leaving the page", async ({ page }) => {
    await gotoOK(page, "/es/servicios");

    const search = page.getByRole("textbox").first();
    await search.fill("Plomer");
    await expect(page.getByText(/Plomer/i).first()).toBeVisible();
    await expect(page.getByText(/Hogar y construcci/i).first()).toBeVisible();

    await search.fill("");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/es\/servicios\/?\??$/);
    await expectNoHorizontalOverflow(page);
  });
});
