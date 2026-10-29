import { test, expect } from "playwright/test";
import { gotoOK, loginAs, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, E2E_USERS } from "./seed";

test("desktop app handoff replaces sign-up, translates and closes accessibly without overlapping search", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "Desktop navigation only");
  for (const locale of ["es", "en"]) {
    for (const width of [1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await gotoOK(page, locale === "en" ? "/en/proyectos" : "/proyectos");
      await waitForInteractivePage(page);
      const header = page.getByTestId("landing-navbar").filter({ visible: true });
      const action = header.getByRole("button", { name: locale === "en" ? "Download app" : "Descargar app", exact: true });
      await expect(action).toBeVisible();
      await expect(header.locator('a[href$="/registro"]')).toHaveCount(0);
      await expect(header.locator('a[href*="/login"]').filter({ visible: true })).toBeVisible();
      const search = header.locator("#ccr-marketplace-navbar-slot");
      const before = (await search.boundingBox())!;
      expect(before.width).toBeGreaterThanOrEqual(260);
      expect(before.x + before.width).toBeLessThanOrEqual((await action.boundingBox())!.x);
      await action.click();
      const panel = header.getByRole("dialog");
      await expect(panel).toBeVisible();
      await expect(panel.locator('img[src^="/stores/download-app-qr.svg"]')).toBeVisible();
      expect((await search.boundingBox())!.width).toBeCloseTo(before.width, 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(action).toBeFocused();
      await action.click();
      await page.locator("main").click({ position: { x: 10, y: 100 } });
      await expect(panel).toHaveCount(0);
    }
  }
});

test("signed-in desktop keeps app access beside account controls", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "Desktop navigation only");
  test.skip(!canRunSeededRegression(), "Requires isolated TEST account");
  await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
  for (const width of [1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoOK(page, "/proyectos");
    await waitForInteractivePage(page);
    const header = page.getByTestId("landing-navbar").filter({ visible: true });
    await expect(header.locator('a[href*="/login"]').filter({ visible: true })).toHaveCount(0);
    await header.getByRole("button", { name: "Descargar app", exact: true }).click();
    await expect(header.getByRole("dialog")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await header.getByRole("button", { name: "Cerrar código de la app" }).click();
  }
});

test("desktop app action stays hidden on mobile", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) >= 1024, "Mobile navigation only");
  await gotoOK(page, "/");
  await expect(page.getByTestId("desktop-app-menu").filter({ visible: true })).toHaveCount(0);
});
