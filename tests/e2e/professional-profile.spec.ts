import { expect, test } from "playwright/test";
import { expectNoHorizontalOverflow, firstProfessionalHref, gotoOK, loginAs } from "./helpers";
import { canRunSeededRegression, ensureRegressionSeed, type RegressionSeedState } from "./seed";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";

test.describe("@seeded professional profile", () => {
  let seed: RegressionSeedState | null = null;

  test.beforeAll(async () => {
    if (canRunSeededRegression()) seed = await ensureRegressionSeed();
  });

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

  test("long professional names remain readable on responsive profile headers", async ({ page }) => {
    const href = await firstProfessionalHref(page);
    expect(href).toBeTruthy();
    await gotoOK(page, href!);
    const name = page.getByTestId("professional-profile-name");
    await expect(name).toBeVisible();

    if ((page.viewportSize()?.width ?? 1280) < 640) {
      await name.evaluate((element) => {
        element.textContent = "Constructora de Costa Rica instalación de proyectos especializados";
      });
      const layout = await name.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: Number.parseFloat(style.fontSize),
          lineHeight: Number.parseFloat(style.lineHeight),
          height: element.getBoundingClientRect().height,
        };
      });
      expect(layout.fontSize).toBeLessThanOrEqual(18);
      expect(layout.height).toBeGreaterThan(layout.lineHeight * 1.5);
      expect(layout.height).toBeLessThanOrEqual(layout.lineHeight * 3.1);
    }
    await expectNoHorizontalOverflow(page);
  });

  test("reviews never freeze navigation back to results or home", async ({ page }) => {
    const href = await firstProfessionalHref(page);
    expect(href, "The verified production mirror must expose at least one professional").toBeTruthy();

    const profile = new URL(href!, page.url());
    const reviewsHref = `${profile.pathname}?tab=resenas&from=${encodeURIComponent("/buscar?categoria=enfermeria")}#resenas`;

    await gotoOK(page, reviewsHref);
    await expect(page.getByRole("heading", { name: /Reseñas|Reviews/i }).first()).toBeVisible();
    await page.getByRole("link", { name: /Volver a resultados|Back to results/i }).click();
    await expect(page).toHaveURL(/\/es\/buscar\?categoria=enfermeria$/);

    await gotoOK(page, reviewsHref);
    await expect(page.getByRole("heading", { name: /Reseñas|Reviews/i }).first()).toBeVisible();
    await page.getByRole("banner").getByRole("link", { name: /ContrataCR inicio/i }).click();
    await expect(page).toHaveURL(/\/es\/?$/);
  });

  test("profile reviews use a compact inline form instead of an isolated modal", async ({ page }) => {
    test.skip(!seed, "Requires protected regression actors.");
    let account: DisposableAccount | undefined;
    try {
      account = await createDisposableAccount({ prefix: "profile-review-inline" });
      await loginAs(page, account.email, account.password);
      await gotoOK(page, `/es/profesionales/${seed!.professionalSlug}?tab=resenas#resenas`);

      await expect(page.getByText("¿Ya trabajaste con este profesional?")).toBeVisible();
      await expect(page.getByRole("button", { name: "Escribir reseña" })).toHaveCount(0);
      await expect(page.getByPlaceholder(/Cuéntanos sobre tu experiencia/i)).toHaveCount(0);
      await page.getByRole("button", { name: "5 estrellas", exact: true }).click();
      await expect(page.getByPlaceholder(/Cuéntanos sobre tu experiencia/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /Enviar reseña|Actualizar reseña/i })).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    } finally {
      await cleanupDisposableAccount(account);
    }
  });

  test("reviews are the second profile section and do not label review provenance", async ({ page }) => {
    const href = await firstProfessionalHref(page);
    expect(href).toBeTruthy();
    await gotoOK(page, href!);

    const tabs = page.getByRole("tablist", { name: /Secciones del perfil|Profile sections/i }).getByRole("tab");
    await expect(tabs.nth(0)).toHaveText(/Servicios|Services/i);
    await expect(tabs.nth(1)).toHaveText(/Reseñas|Reviews/i);

    await tabs.nth(1).click();
    await expect(page.getByText(/Contratación verificada|Contacto confirmado|Experiencia no verificada|Verified booking|Confirmed contact|Unverified experience/i)).toHaveCount(0);
  });
});
