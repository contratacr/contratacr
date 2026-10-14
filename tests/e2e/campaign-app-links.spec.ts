import { expect, test } from "playwright/test";
import { campaignAppPath } from "../../src/lib/mobile/campaign-app-link";
import { brandedEmailDocument } from "../../src/lib/email/send";

test("campaign links preserve section, query and fragment without accepting external or auth routes", () => {
  expect(campaignAppPath("https://contratacr.com/dashboard/profesional?tab=completion#precio")).toBe("/dashboard/profesional?tab=completion#precio");
  expect(campaignAppPath("https://contratacr.com/en/empleos/123")).toBe("/en/empleos/123");
  expect(campaignAppPath("https://contratacr.com/api/trabajos/reportar?p=abc&s=2026-10-05&n=1&f=signed")).toContain("&f=signed");
  for (const url of ["https://evil.example/dashboard", "https://contratacr.com.evil.example/dashboard", "https://evil@contratacr.com/dashboard", "http://contratacr.com/dashboard", "https://contratacr.com/api/email/baja", "https://contratacr.com/auth/callback", "https://contratacr.com/admin", "javascript:alert(1)"]) expect(campaignAppPath(url)).toBeNull();
});
for (const colorScheme of ["light", "dark"] as const) test(`browser confirmation keeps the navy logo on a white card in ${colorScheme} mode`, async ({ page }) => {
  await page.emulateMedia({ colorScheme });
  await page.setContent(brandedEmailDocument({ title: "Confirmar respuesta", bodyHtml: "<p>Tu respuesta: 1 trabajo.</p>", origin: "http://localhost:3000", browserPage: true }));
  const logo = page.locator(".ccr-light-logo");
  await expect(logo).toBeVisible();
  await expect(page.locator(".ccr-dark-logo")).toBeHidden();
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
});
