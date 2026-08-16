import { expect, test, type Page, type TestInfo } from "playwright/test";
import { expectHealthyPage, expectNoHorizontalOverflow, firstProfessionalHref, gotoOK, isMobileProject, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, regressionAdminClient } from "./seed";

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
    expect(href, "The verified production mirror must expose at least one professional").toBeTruthy();

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

  test("card keeps favorite at the outer edge without colliding with price", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const href = await firstProfessionalHref(page);
    expect(href, "The verified production mirror must expose at least one professional").toBeTruthy();

    const cards = page.locator("[data-pro-id]");
    const count = Math.min(await cards.count(), 6);
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const card = cards.nth(index);
      const favorite = card.getByRole("button", { name: /Guardar profesional|Quitar de favoritos/i });
      const price = card.getByTestId("professional-card-mobile-price-primary");
      await expect(favorite).toBeVisible();
      await expect(price).toBeVisible();

      const [cardBox, favoriteBox, priceBox] = await Promise.all([
        card.boundingBox(),
        favorite.boundingBox(),
        price.boundingBox(),
      ]);
      expect(cardBox).not.toBeNull();
      expect(favoriteBox).not.toBeNull();
      expect(priceBox).not.toBeNull();
      const favoriteRight = favoriteBox!.x + favoriteBox!.width;
      const priceRight = priceBox!.x + priceBox!.width;
      expect(cardBox!.x + cardBox!.width - favoriteRight).toBeGreaterThanOrEqual(8);
      expect(cardBox!.x + cardBox!.width - favoriteRight).toBeLessThanOrEqual(20);
      expect(favoriteRight).toBeGreaterThanOrEqual(priceRight);
      expect(favoriteRight - priceRight).toBeLessThanOrEqual(32);
    }
    await expectNoHorizontalOverflow(page);
  });

  test("mobile cards keep service, price and price detail on aligned rows", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoOK(page, "/es/buscar");

    const card = page.locator("[data-pro-id]").first();
    await expect(card).toBeVisible();
    const service = card.getByTestId("professional-card-mobile-service").first();
    const primaryPrice = card.getByTestId("professional-card-mobile-price-primary");
    await expect(service).toBeVisible();
    await expect(primaryPrice).toBeVisible();
    await expect(primaryPrice).toHaveAttribute("aria-label", /.+/);

    const detail = card.getByTestId("professional-card-mobile-price-secondary");
    if (await detail.count()) {
      await expect(detail).toBeVisible();
      await expect(detail).toContainText(/A consultar|On request|\/\S+|I\.V\.A\.I\./i);
    }

    const layout = await card.evaluate((node) => {
      const cardBox = node.getBoundingClientRect();
      const rect = (selector: string) => {
        const element = node.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      };
      return {
        card: { left: cardBox.left, right: cardBox.right, top: cardBox.top },
        meta: rect('[data-testid="professional-card-mobile-meta-row"]'),
        serviceRow: rect('[data-testid="professional-card-service-summary"]'),
        service: rect('[data-testid="professional-card-mobile-service"]'),
        primary: rect('[data-testid="professional-card-mobile-price-primary"]'),
        detail: rect('[data-testid="professional-card-mobile-price-secondary"]'),
      };
    });
    expect(layout.card).not.toBeNull();
    expect(layout.meta).not.toBeNull();
    expect(layout.serviceRow).not.toBeNull();
    expect(layout.service).not.toBeNull();
    expect(layout.primary).not.toBeNull();
    expect(layout.primary!.top).toBeGreaterThanOrEqual(layout.meta!.top - 1);
    expect(layout.primary!.right).toBeLessThanOrEqual(layout.card!.right + 1);
    expect(layout.serviceRow!.top).toBeGreaterThan(layout.meta!.top);
    expect(layout.service!.top).toBeGreaterThan(layout.primary!.top);
    if (layout.detail) {
      expect(layout.detail.top).toBeGreaterThanOrEqual(layout.primary!.top);
      expect(layout.detail.right).toBeLessThanOrEqual(layout.card!.right + 1);
    }
  });

  test("long mobile service labels stay readable instead of showing two truncated chips", async ({ page }, testInfo) => {
    if (!isMobileProject(testInfo)) return;
    await firstProfessionalHref(page);

    const rows = page.locator('[data-testid="professional-card-service-summary"]');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);
      await expect(row).toBeVisible();
      const visibleServices = await row.locator('[data-testid="professional-card-mobile-service"]').count();
      expect(visibleServices).toBeGreaterThanOrEqual(1);
      expect(visibleServices).toBeLessThanOrEqual(3);
      const hiddenCount = Number(await row.getAttribute("data-hidden-count"));
      if (hiddenCount > 0) {
        const more = row.getByTestId("professional-card-more-services");
        await expect(more).toHaveText(`+${hiddenCount}`);
        const lastService = row.locator('[data-testid="professional-card-mobile-service"]').last();
        const [chipBox, moreBox] = await Promise.all([lastService.boundingBox(), more.boundingBox()]);
        expect(chipBox).not.toBeNull();
        expect(moreBox).not.toBeNull();
        const chipBaseline = chipBox!.y + chipBox!.height;
        const moreBaseline = moreBox!.y + moreBox!.height;
        expect(Math.abs(chipBaseline - moreBaseline)).toBeLessThanOrEqual(2);
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
    await expect(page).toHaveURL(/provincia=gu/);
    await expectHealthyPage(page);
  });

  test("filters expose the current search controls and retired controls stay gone", async ({ page }, testInfo) => {
    await gotoOK(page, "/es/buscar?categoria=desarrollo_web");
    await waitForInteractivePage(page);
    await openFiltersIfNeeded(page, testInfo);

    const body = page.locator("body");
    if (isMobileProject(testInfo)) {
      const languageChip = page.getByTestId("mobile-language-filter").filter({ visible: true }).first();
      await expect(languageChip).toHaveText(/Idioma|Language/i);
      await expect(languageChip).not.toHaveText(/Espa[nñ]ol|Spanish/i);
      await languageChip.click();
      const languageDialog = page.getByRole("dialog", { name: /Idioma de atenci[oó]n|Service language/i });
      await expect(languageDialog).toBeVisible();
      await expect(languageDialog.getByRole("button", { name: /Todos los idiomas|All languages/i })).toBeVisible();
    } else {
      await expect(page.getByText(/Idioma de atenci[oó]n|Service language/i).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByRole("combobox", { name: /Idioma de atenci[oó]n|Service language/i }).filter({ visible: true }).first()).toContainText(/Cualquier idioma|Any language/i);
    }
    await expect(body).not.toContainText(/Solo verificados|Only verified/i);
    await expect(body).not.toContainText(/Buscar profesionales cerca de m[ií]|Find professionals near me/i);
    await expect(body).not.toContainText(/Cercan[ií]a|Nearest/i);
    await expect(page.getByRole("button", { name: /^(?:Anterior|Siguiente|Previous|Next)$/i })).toHaveCount(0);
    await expect(page.getByText(/^(?:P[aá]gina \d+ de \d+|Page \d+ of \d+)$/i)).toHaveCount(0);
    await expectHealthyPage(page);
  });

  test("completed searches keep the selected service and location in the mobile search header", async ({ page }, testInfo) => {
    if (!isMobileProject(testInfo)) return;
    await gotoOK(page, "/es/buscar?categoria=aire_acondicionado&provincia=al&canton=al-al");
    await waitForInteractivePage(page);

    const summary = page.getByTestId("search-context-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(/Aire acondicionado/i);
    await expect(summary).toContainText(/Alajuela/i);
    await expect(summary).not.toContainText(/Qué servicio estás buscando/i);
  });

  test("nationwide video consultations survive a different physical location filter", async ({ page }) => {
    test.skip(!canRunSeededRegression(), "Seeded video professional is required for video/location regression.");
    const seed = await ensureRegressionSeed();
    const cacheBust = Date.now();

    for (const query of [
      `/es/buscar?categoria=${seed.videoCategoryId}&provincia=gu&canton=gu-li&lat=10.6346&lng=-85.4404&regression=${cacheBust}`,
      `/es/buscar?categoria=${seed.videoCategoryId}&provincia=gu&canton=gu-li&modalidad=video&lat=10.6346&lng=-85.4404&regression=${cacheBust}`,
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

  test("whole-province coverage survives canton and resolved-address searches", async ({ page }) => {
    test.skip(!canRunSeededRegression(), "The seeded whole-province professional is required for location hierarchy regression.");
    const seed = await ensureRegressionSeed();
    const { data: fixture, error: fixtureError } = await regressionAdminClient()
      .from("professionals")
      .select("coverage_provincias")
      .eq("id", seed.professionalId)
      .single();
    expect(fixtureError).toBeNull();
    expect(fixture?.coverage_provincias).toContain("al");
    const cacheBust = Date.now();

    for (const query of [
      `/es/buscar?categoria=aire_acondicionado&provincia=al&regression=${cacheBust}`,
      `/es/buscar?categoria=aire_acondicionado&provincia=al&canton=al-al&regression=${cacheBust}`,
      `/es/buscar?categoria=aire_acondicionado&provincia=al&canton=al-al&lat=10.01625&lng=-84.21163&regression=${cacheBust}`,
    ]) {
      await gotoOK(page, query);
      await waitForInteractivePage(page);

      const card = page.locator("article").filter({ hasText: E2E_USERS.professional.fullName }).first();
      await expect(card).toBeVisible();
      await expect(card).toContainText(/Aire acondicionado/i);
      await expectHealthyPage(page);
    }
  });
});
