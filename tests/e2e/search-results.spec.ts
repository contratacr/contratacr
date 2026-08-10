import { expect, test, type Page, type TestInfo } from "playwright/test";
import { expectHealthyPage, expectNoHorizontalOverflow, firstProfessionalHref, gotoOK, isMobileProject, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed } from "./seed";

async function openFiltersIfNeeded(page: Page, testInfo: TestInfo) {
  if (!isMobileProject(testInfo)) return;

  const closeMenu = page.getByRole("button", { name: /Cerrar men|Close menu/i }).first();
  const closeBox = await closeMenu.boundingBox().catch(() => null);
  const viewport = page.viewportSize();
  const closeIsOnScreen =
    closeBox && viewport &&
    closeBox.x < viewport.width &&
    closeBox.x + closeBox.width > 0 &&
    closeBox.y < viewport.height &&
    closeBox.y + closeBox.height > 0;
  if (closeIsOnScreen) await closeMenu.click();

  const filtersButton = page.locator("button:visible").filter({ hasText: /^Filtros$|^Filters$/i }).first();
  if (await filtersButton.isVisible().catch(() => false)) await filtersButton.click();
}

test.describe("@seeded search results", () => {
  test.beforeAll(async () => {
    if (canRunSeededRegression()) await ensureRegressionSeed();
  });

  test("search results render professional cards with primary actions", async ({ page }) => {
    const href = await firstProfessionalHref(page);
    test.skip(!href, "No seeded professionals found in this environment.");

    const firstCard = page.locator("article:visible").first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard.getByRole("link").first()).toBeVisible();
    await expect(firstCard.getByText(/Verificado|Sin rese|reviews|\d+\.\d/i).filter({ visible: true }).first()).toBeVisible();
    await expect(
      firstCard.getByRole("button", { name: /Ver horario completo|Ver disponibilidad|Enviar mensaje|Contact|Llamar|Solicitar/i }).or(
        firstCard.getByRole("link", { name: /Enviar mensaje|Contact|Llamar|Solicitar/i }),
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

  test("long mobile service labels stay readable instead of showing two truncated chips", async ({ page }, testInfo) => {
    if (!isMobileProject(testInfo)) return;
    await firstProfessionalHref(page);

    const completeLabels = page.locator('[data-testid="professional-card-mobile-service"][data-full-label="true"]');
    const count = await completeLabels.count();
    for (let index = 0; index < count; index += 1) {
      const chip = completeLabels.nth(index);
      await expect(chip).toBeVisible();
      const title = await chip.getAttribute("title");
      expect((await chip.innerText()).trim()).toContain(title?.trim());
      const row = chip.locator('xpath=ancestor::*[@data-testid="professional-card-service-summary"][1]');
      const visibleServices = await row.locator('[data-testid="professional-card-mobile-service"]').count();
      expect(visibleServices).toBeGreaterThanOrEqual(1);
      expect(visibleServices).toBeLessThanOrEqual(3);
      const extraCount = Number(await chip.getAttribute("data-extra-count"));
      if (extraCount > 0) {
        const more = row.getByTestId("professional-card-more-services");
        await expect(more).toHaveText(`+${extraCount}`);
        const lastService = row.locator('[data-testid="professional-card-mobile-service"]').last();
        const [chipBox, moreBox] = await Promise.all([lastService.boundingBox(), more.boundingBox()]);
        expect(chipBox).not.toBeNull();
        expect(moreBox).not.toBeNull();
        expect(Math.abs(chipBox!.y - moreBox!.y)).toBeLessThanOrEqual(2);
        expect(moreBox!.x - (chipBox!.x + chipBox!.width)).toBeLessThanOrEqual(10);
      }
    }
    await expectNoHorizontalOverflow(page);
  });

  test("search query can navigate from the header to filtered results", async ({ page }) => {
    await gotoOK(page, "/es");
    await waitForInteractivePage(page);
    const search = page.getByRole("combobox", { name: /Qu[eé] servicio|Qu[eé] necesitas|What service|What do you need/i }).first();
    await search.fill("plomeria");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/es\/buscar/);
    await expect(
      page.locator("article").first().or(page.getByText(/No encontramos resultados/i).first()),
    ).toBeVisible();
  });

  test("location search suggests Costa Rica provinces and cantons", async ({ page }, testInfo) => {
    await gotoOK(page, "/es/buscar");
    await waitForInteractivePage(page);

    if (isMobileProject(testInfo)) {
      await page.getByRole("button", { name: /Qu[eé] servicio|What service/i }).filter({ visible: true }).first().click();
      const location = page.getByRole("combobox", { name: /Ubicaci[oó]n|Location/i }).filter({ visible: true }).first();
      await expect(location).toBeVisible();
      await location.fill("Liber");
      const liberia = page.getByRole("option", { name: /Liberia/i }).filter({ visible: true }).first();
      await expect(liberia).toBeVisible();
      await liberia.click();

      const service = page.getByRole("combobox", { name: /^Servicio$|^Service$/i }).filter({ visible: true }).first();
      await service.fill("plomeria");
      const plumbing = page.getByRole("option", { name: /Plomer[ií]a|Plumbing/i }).filter({ visible: true }).first();
      await expect(plumbing).toBeVisible();
      await plumbing.click();
    } else {
      const location = page.getByRole("combobox", { name: /Ubicaci[oó]n|Location/i }).filter({ visible: true }).first();
      await expect(location).toBeVisible();
      await location.fill("Liber");
      const liberia = page.getByRole("option", { name: /Liberia/i }).filter({ visible: true }).first();
      await expect(liberia).toBeVisible();
      await liberia.click();
      await page.getByRole("button", { name: /^Buscar$|^Search$/i }).filter({ visible: true }).first().click();
    }

    await expect(page).toHaveURL(/canton=gu-li/);
    await expectHealthyPage(page);
  });

  test("filters expose the current search controls and retired controls stay gone", async ({ page }, testInfo) => {
    await gotoOK(page, "/es/buscar?categoria=desarrollo_web");
    await waitForInteractivePage(page);
    await openFiltersIfNeeded(page, testInfo);

    const body = page.locator("body");
    if (isMobileProject(testInfo)) {
      await page.getByRole("button", { name: /^Idioma$|^Language$/i }).filter({ visible: true }).first().click();
      await expect(page.getByText(/Idioma de atenci[oó]n|Service language/i).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Todos los idiomas|All languages/i }).filter({ visible: true }).first()).toBeVisible();
    } else {
      await expect(page.getByText(/Idioma|Language/i).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText(/Selecciona un idioma|Select a language|Any language/i).filter({ visible: true }).first()).toBeVisible();
    }
    await expect(body).not.toContainText(/Solo verificados|Only verified/i);
    await expect(body).not.toContainText(/Buscar profesionales cerca de m[ií]|Find professionals near me/i);
    await expect(body).not.toContainText(/Cercan[ií]a|Nearest/i);
    await expect(body).not.toContainText(/Anterior|Siguiente|P[aá]gina \d+ de|Previous|Next|Page \d+ of/i);
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
      await expect(card.locator('a[href*="/profesionales/"]').first()).toBeVisible();
      await expectHealthyPage(page);
    }
  });
});
