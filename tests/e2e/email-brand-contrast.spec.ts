import { readFileSync, readdirSync } from "node:fs";
import { brandedEmailDocument } from "../../src/lib/email/send";
import { expect, test } from "playwright/test";

const dir = "supabase/email-templates";
const examples = [
  ...readdirSync(dir).filter((name) => name.endsWith(".html")).map((name) => ({ name, html: readFileSync(`${dir}/${name}`, "utf8") })),
  { name: "shared", html: brandedEmailDocument({title: "Correo de ejemplo", bodyHtml: '<h1>Correo de ejemplo</h1><p>Contenido de prueba.</p>'}) },
];

for (const mode of ["light", "dark", "outlook-dark"] as const) {
  test(`email logo contrast: ${mode}`, async ({ page }) => {
    await page.setViewportSize({width: 390, height: 760});
    await page.emulateMedia({ colorScheme: mode === "dark" ? "dark" : "light" });
    for (const example of examples) {
      const html = example.html.replace(/https:\/\/contratacr\.com\/brand\/(email-logo-(?:light|dark)\.png)\?v=2/g,
        (_, file: string) => `data:image/png;base64,${readFileSync(`public/brand/${file}`).toString("base64")}`);
      await page.setContent(html);
      if (mode === "outlook-dark") await page.locator("body").evaluate((el) => el.setAttribute("data-ogsc", ""));
      const light = page.locator(".light-logo, .ccr-light-logo");
      const dark = page.locator(".dark-logo, .ccr-dark-logo");
      await expect(mode === "light" ? light : dark, example.name).toBeVisible();
      await expect(mode === "light" ? dark : light, example.name).toBeHidden();
      await expect(page.locator(".ccr-email-card"), example.name).toHaveCSS("background-color", mode === "light" ? "rgb(255, 255, 255)" : "rgb(17, 24, 39)");
      await expect(page.locator(".ccr-email-card"), example.name).toHaveCSS("border-top-width", "0px");
      await expect(page.locator(".ccr-email-card"), example.name).toHaveCSS("border-radius", "0px");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), example.name).toBe(true);
      const image = mode === "light" ? light : dark;
      await image.evaluate((el: HTMLImageElement) => el.decode());
      const logoBox = await image.boundingBox();
      const headingBox = await page.locator("h1").first().boundingBox();
      expect(Math.abs(logoBox!.x - headingBox!.x), example.name).toBeLessThan(1);
      if (await page.locator(".ccr-email-code").count()) {
        const box = await page.locator(".ccr-email-code").boundingBox();
        expect(Math.abs(box!.x + box!.width / 2 - 195), example.name).toBeLessThan(1);
      }
      // Transparent pixels are essential: CSS alone cannot remove the old white box.
      expect(await image.evaluate((el: HTMLImageElement) => {
        const canvas = document.createElement("canvas"); canvas.width = el.naturalWidth; canvas.height = el.naturalHeight;
        const ctx = canvas.getContext("2d")!; ctx.drawImage(el, 0, 0);
        return ctx.getImageData(0, 0, 1, 1).data[3];
      }), example.name).toBe(0);
    }
  });
}
