import { expect, test } from "playwright/test";
import { gotoOK, waitForInteractivePage } from "./helpers";

for (const route of ["/empleos", "/proyectos", "/promociones"]) {
  test(`la foto de perfil se amplía sin navegar en ${route}`, async ({ page }) => {
    await gotoOK(page, route);
    await waitForInteractivePage(page);
    if (route === "/promociones") {
      const href = await page.locator('h2 a[href*="/promociones/"]').filter({ visible: true }).first().getAttribute("href");
      expect(href).toBeTruthy();
      await gotoOK(page, href!);
      await waitForInteractivePage(page);
    }
    const photo = page.getByRole("button", { name: "Ver foto de perfil", exact: true }).filter({ visible: true }).first();
    await expect(photo).toBeVisible();
    const url = page.url();
    await photo.click();
    const viewer = page.getByRole("dialog");
    await expect(viewer).toBeVisible();
    await expect(viewer.locator("img")).toBeVisible();
    await expect(page).toHaveURL(url);
    await viewer.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(viewer).toBeHidden();
    await expect(photo).toBeFocused();
    await photo.press("Enter");
    await expect(viewer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    await expect(page).toHaveURL(url);
  });
}
