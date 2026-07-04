import { expect, test } from "playwright/test";
import { expectHealthyPage, expectNoHorizontalOverflow, firstProfessionalHref, gotoOK, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed } from "./seed";

test.describe("@seeded search results", () => {
  test.beforeAll(async () => {
    if (canRunSeededRegression()) await ensureRegressionSeed();
  });

  test("search results render professional cards with primary actions", async ({ page }) => {
    const href = await firstProfessionalHref(page);
    test.skip(!href, "No seeded professionals found in this environment.");

    const firstCard = page.locator("article").first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard.getByRole("link").first()).toBeVisible();
    await expect(firstCard.getByText(/Verificado|Sin rese|reviews|\d+\.\d/i).first()).toBeVisible();
    await expect(
      firstCard.getByRole("button", { name: /Ver horario completo|Ver disponibilidad|Contact|WhatsApp|Llamar|Solicitar/i }).or(
        firstCard.getByRole("link", { name: /Contact|WhatsApp|Llamar|Solicitar/i }),
      ).first(),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("card keeps favorite visible and avoids layout overflow", async ({ page }) => {
    const href = await firstProfessionalHref(page);
    test.skip(!href, "No seeded professionals found in this environment.");

    const favorite = page.getByRole("button", { name: /Guardar profesional|Quitar de favoritos/i }).first();
    await expect(favorite).toBeVisible();

    const box = await favorite.boundingBox();
    const viewport = page.viewportSize();
    expect(box, "Favorite button should have a bounding box").not.toBeNull();
    expect(viewport, "Viewport should be available").not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
    await expectNoHorizontalOverflow(page);
  });

  test("search query can navigate from the header to filtered results", async ({ page }) => {
    await gotoOK(page, "/es");
    await waitForInteractivePage(page);
    const search = page.getByRole("combobox", { name: /Qu[eé] servicio|Qu[eé] necesitas|What service|What do you need/i }).first();
    await search.fill("plomeria");
    await search.locator("xpath=ancestor::form[1]").getByRole("button", { name: /Buscar|Search/i }).first().click();
    await expect(page).toHaveURL(/\/es\/buscar/);
    await expect(
      page.locator("article").first().or(page.getByText(/No encontramos resultados/i).first()),
    ).toBeVisible();
  });

  test("location filter suggests Costa Rica provinces and cantons", async ({ page }) => {
    await gotoOK(page, "/es/buscar");
    await waitForInteractivePage(page);

    const location = page.getByPlaceholder(/Busca una ubicaci[oó]n|Search a location/i).first();
    await location.fill("Liber");
    await expect(page.getByRole("option", { name: /Liberia/i }).first()).toBeVisible();
    await page.getByRole("option", { name: /Liberia/i }).first().click();

    await expect(page).toHaveURL(/provincia=gu/);
    await expect(page).toHaveURL(/canton=gu-li/);
    await expectHealthyPage(page);
  });

  test("nationwide video consultations survive a different physical location filter", async ({ page }) => {
    test.skip(!canRunSeededRegression(), "Seeded video professional is required for video/location regression.");
    const seed = await ensureRegressionSeed();

    for (const query of [
      `/es/buscar?categoria=${seed.videoCategoryId}&provincia=gu&canton=gu-li`,
      `/es/buscar?categoria=${seed.videoCategoryId}&provincia=gu&canton=gu-li&modalidad=video`,
    ]) {
      await gotoOK(page, query);
      await waitForInteractivePage(page);

      const card = page.locator("article").filter({ hasText: E2E_USERS.videoProfessional.businessName }).first();
      await expect(card).toBeVisible();
      await expect(card).toContainText(/Videoconsulta|Video consultation/i);
      await expect(card).toContainText(/I\.V\.A\.I\.|VAT included/i);
      await expect(card).not.toContainText(/Atenas|Alajuela/i);
      await expect(
        card.getByRole("link", { name: /WhatsApp/i }).or(card.getByRole("button", { name: /WhatsApp/i })).first(),
      ).toBeVisible();
      await expect(card).not.toContainText(/\b10:00\b|\b11:00\b/);
      await expectHealthyPage(page);
    }
  });
});
