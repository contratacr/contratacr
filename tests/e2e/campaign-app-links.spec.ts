import { expect, test } from "playwright/test";
import { campaignAppPath } from "../../src/lib/mobile/campaign-app-link";
import { brandedEmailDocument } from "../../src/lib/email/send";

test("campaign links preserve section, query and fragment without accepting external or auth routes", () => {
  expect(campaignAppPath("https://contratacr.com/?utm_source=google")).toBe("/?utm_source=google");
  expect(campaignAppPath("https://contratacr.com/en")).toBe("/en");
  expect(campaignAppPath("https://www.contratacr.com/en/proyectos?categoria=limpieza&_ccr_open=ios#detalle")).toBe("/en/proyectos?categoria=limpieza#detalle");
  expect(campaignAppPath("https://contratacr.com/profesionales?categoria=soldadura")).toBe("/profesionales?categoria=soldadura");
  expect(campaignAppPath("https://contratacr.com/dashboard/profesional?tab=completion#precio")).toBe("/dashboard/profesional?tab=completion#precio");
  expect(campaignAppPath("https://contratacr.com/en/empleos/123")).toBe("/en/empleos/123");
  expect(campaignAppPath("https://contratacr.com/api/trabajos/reportar?p=abc&s=2026-10-05&n=1&f=signed")).toContain("&f=signed");
  for (const url of ["https://contratacr.com/?code=once", "https://contratacr.com/#access_token=secret", "https://contratacr.com/dashboard/native-auth-return?code=once", "https://contratacr.com/en/dashboard/native-auth-return?code=once", "https://evil.example/dashboard", "https://contratacr.com.evil.example/dashboard", "https://evil@contratacr.com/dashboard", "http://contratacr.com/dashboard", "https://contratacr.com/api/email/baja", "https://contratacr.com/auth/callback", "https://contratacr.com/admin", "javascript:alert(1)"]) expect(campaignAppPath(url)).toBeNull();
});
for (const colorScheme of ["light", "dark"] as const) test(`browser confirmation keeps the navy logo on a white card in ${colorScheme} mode`, async ({ page, baseURL }) => {
  await page.emulateMedia({ colorScheme });
  await page.setContent(brandedEmailDocument({ title: "Confirmar respuesta", bodyHtml: "<p>Tu respuesta: 1 trabajo.</p>", origin: baseURL!, browserPage: true }));
  const logo = page.locator(".ccr-light-logo");
  await expect(logo).toBeVisible();
  await expect(page.locator(".ccr-dark-logo")).toBeHidden();
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
});

for (const locale of ['', '/en']) test(`first-run native welcome yields to a validated external destination ${locale || 'es'}`, async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.addCookies([{ name: 'ccr_platform', value: 'native', url: baseURL! }]);
  await page.goto(`${locale}/profesionales`);
  const welcome = page.getByTestId('native-first-run-onboarding');
  await expect(welcome).toBeVisible();
  // Mirrors the accepted native-link event; destination auth remains unchanged.
  await page.evaluate(() => {
    sessionStorage.setItem('ccr:native-first-run-auth-session:v1', '1');
    window.dispatchEvent(new Event('contratacr:native-external-link'));
  });
  await expect(welcome).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('ccr:native-first-run-onboarding:v12'))).not.toBe('1');
  await expect(page).toHaveURL(new RegExp(`${locale}/profesionales$`));
});
