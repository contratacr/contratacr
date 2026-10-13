import { test, expect } from "playwright/test";
import { gotoOK } from "./helpers";

test("navbar logo stays identical without web fonts across public routes", async ({ page }) => {
  // Reproduce a cold/slow font request: the logo must not fall back to Arial.
  await page.route(/\.woff2(?:\?.*)?$/, route => route.abort());
  for (const path of ["/", "/registro", "/login", "/proyectos", "/promociones", "/empleos"]) {
    await gotoOK(page, path);
    // Marketplace mobile headers intentionally show only the mark + section
    // title. The full brand lives in their shared navigation drawer.
    const marketplace = (page.viewportSize()?.width ?? 1440) < 1024 && ["/proyectos", "/promociones", "/empleos"].includes(path);
    if (marketplace) await page.getByRole("button", { name: /abrir menú/i }).filter({ visible: true }).click();
    const surface = marketplace ? page.getByRole("dialog").filter({ visible: true }) : page.locator("header");
    const wordmark = surface.locator('img[src="/brand/wordmark-light.svg"]').filter({ visible: true });
    await expect(wordmark).toHaveCount(1);
    await expect.poll(() => wordmark.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const box = await wordmark.boundingBox();
    expect(box!.width).toBe(105);
    expect(box!.height).toBe(24);
  }
});
