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
    expect(box!.width).toBeCloseTo(105, 2);
    expect(box!.height).toBeCloseTo(24, 2);
    // Measure visible ink, including transparent padding inside the mark.
    const measureVisibleGap = () => wordmark.evaluate(async (word: HTMLImageElement) => {
      const mark = word.previousElementSibling as HTMLImageElement;
      await Promise.all([mark.decode(), word.decode()]);
      const ink = (img: HTMLImageElement) => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const context = canvas.getContext("2d")!;
        context.drawImage(img, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let left = canvas.width, right = -1;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          if (pixels[(y * canvas.width + x) * 4 + 3] > 32) {
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
        }
        const rect = img.getBoundingClientRect();
        return { left: rect.left + left / canvas.width * rect.width, right: rect.left + (right + 1) / canvas.width * rect.width };
      };
      return ink(word).left - ink(mark).right;
    });
    await expect.poll(measureVisibleGap).toBeGreaterThanOrEqual(4);
    await expect.poll(measureVisibleGap).toBeLessThanOrEqual(6);
  }
});
