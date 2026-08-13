import { expect, test } from "playwright/test";
import { expectNoHorizontalOverflow, firstProfessionalHref, gotoOK } from "./helpers";

test.describe("@seeded professional profile", () => {
  test("first search result opens a complete public profile", async ({ page }) => {
    const href = await firstProfessionalHref(page);
    expect(href, "The verified production mirror must expose at least one professional").toBeTruthy();

    await gotoOK(page, href!);
    await expect(page).toHaveURL(/\/es\/profesionales\//);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("main").getByText(/Servicios|Sobre mi|Rese|Casos de/i).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("professional share image is generated as a PNG", async ({ page, request }) => {
    test.setTimeout(45_000);
    const href = await firstProfessionalHref(page);
    expect(href, "The verified production mirror must expose at least one professional").toBeTruthy();

    const profileUrl = new URL(href!, page.url());
    profileUrl.pathname = `${profileUrl.pathname.replace(/\/$/, "")}/opengraph-image`;
    profileUrl.search = `e2e=${Date.now()}`;
    const response = await request.get(profileUrl.toString(), { timeout: 30_000 });

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    expect((await response.body()).byteLength).toBeGreaterThan(10_000);
  });
});
