import { expect, test } from "playwright/test";
import { expectNoHorizontalOverflow, firstProfessionalHref, gotoOK } from "./helpers";

test.describe("@seeded professional profile", () => {
  test("first search result opens a complete public profile", async ({ page }) => {
    const href = await firstProfessionalHref(page);
    test.skip(!href, "No seeded professionals found in this environment.");

    await gotoOK(page, href);
    await expect(page).toHaveURL(/\/es\/profesionales\//);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("main").getByText(/Servicios|Sobre mi|Rese|Casos de/i).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("professional share image is generated as a PNG", async ({ page, request }) => {
    const href = await firstProfessionalHref(page);
    test.skip(!href, "No seeded professionals found in this environment.");

    const response = await request.get(`${href}/opengraph-image?e2e=${Date.now()}`);

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    expect((await response.body()).byteLength).toBeGreaterThan(10_000);
  });
});
