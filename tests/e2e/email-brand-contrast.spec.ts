import { readFileSync, readdirSync } from "node:fs";
import { expect, test } from "playwright/test";

const dir = "supabase/email-templates";
const shared = readFileSync("src/lib/email/send.ts", "utf8");
const sharedStyles = shared.match(/EMAIL_LOGO_DARK_MODE_STYLES = `([\s\S]*?)`;/)![1];
const sharedLogo = shared.match(/export function emailLogoMarkup[\s\S]*?return `([\s\S]*?)`;/)![1].replaceAll("${site}", "https://contratacr.com");
const examples = [
  ...readdirSync(dir).filter((name) => name.endsWith(".html")).map((name) => ({ name, html: readFileSync(`${dir}/${name}`, "utf8") })),
  { name: "shared", html: `<style>${sharedStyles}</style><div class="ccr-email-card" style="background:#fff">${sharedLogo}<h1>Correo de ejemplo</h1></div>` },
];

for (const mode of ["light", "dark", "outlook-dark"] as const) {
  test(`email logo contrast: ${mode}`, async ({ page }) => {
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
      await expect(page.locator(".ccr-email-card"), example.name).toHaveCSS("background-color", mode === "light" ? "rgb(255, 255, 255)" : "rgb(31, 41, 55)");
      const image = mode === "light" ? light : dark;
      await image.evaluate((el: HTMLImageElement) => el.decode());
      // Transparent pixels are essential: CSS alone cannot remove the old white box.
      expect(await image.evaluate((el: HTMLImageElement) => {
        const canvas = document.createElement("canvas"); canvas.width = el.naturalWidth; canvas.height = el.naturalHeight;
        const ctx = canvas.getContext("2d")!; ctx.drawImage(el, 0, 0);
        return ctx.getImageData(0, 0, 1, 1).data[3];
      }), example.name).toBe(0);
    }
  });
}
