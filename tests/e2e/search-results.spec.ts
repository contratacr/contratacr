import { expect, test } from "playwright/test";
import { expectNoHorizontalOverflow, firstProfessionalHref, gotoOK, waitForInteractivePage } from "./helpers";

test.describe("@seeded search results", () => {
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
});
