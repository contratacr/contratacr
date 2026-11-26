import { test, expect, type Page } from "playwright/test";
import { gotoOK, waitForInteractivePage } from "./helpers";

// The cookie notice says that browsing the site means acceptance. This runs against the
// real app (client-side navigation), which the isolated harness in cookie-preferences.spec.ts cannot cover.
test.use({ storageState: { cookies: [], origins: [] } });

const choices = (page: Page) => page.evaluate(() => ["analytics", "advertising"].map(purpose => {
  const raw = localStorage.getItem(`contratacr:consent:${purpose}:v1`);
  return raw ? JSON.parse(raw) as { choice: string; source?: string } : null;
}));

async function goToAnotherPageInTheApp(page: Page) {
  // A client-side navigation (no reload): the footer link to the terms.
  await page.locator("footer a[href$='/terminos']").first().click();
  await expect(page).toHaveURL(/\/terminos/);
}

test("web: hard loads never accept; moving to another page of the app counts as accepting (implicit)", async ({ page }) => {
  await gotoOK(page, "/privacidad");
  await waitForInteractivePage(page);
  const banner = page.locator("[data-cookie-banner]");
  await expect(banner).toBeVisible();
  expect(await choices(page)).toEqual([null, null]);
  await gotoOK(page, "/terminos");
  await expect(banner).toBeVisible();
  expect(await choices(page)).toEqual([null, null]);
  await goToAnotherPageInTheApp(page);
  expect(await choices(page)).toEqual([null, null]); // same page: not a navigation
  await gotoOK(page, "/privacidad");
  await waitForInteractivePage(page);
  await expect(banner).toBeVisible();
  await page.locator("footer a[href$='/terminos']").first().click();
  await expect(banner).toHaveCount(0);
  const saved = await choices(page);
  expect(saved.map(c => c?.choice)).toEqual(["accepted", "accepted"]);
  expect(saved.map(c => c?.source)).toEqual(["implicit", "implicit"]);
});

test("web: a refusal saved earlier is not overridden by browsing", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("contratacr:consent:advertising:v1", JSON.stringify({ version: "2026-10-29", choice: "declined", at: new Date().toISOString() }));
  });
  await gotoOK(page, "/privacidad");
  await waitForInteractivePage(page);
  await expect(page.locator("[data-cookie-banner]")).toBeVisible();
  await page.locator("footer a[href$='/terminos']").first().click();
  await expect(page).toHaveURL(/\/terminos/);
  await expect.poll(async () => (await choices(page))[0]?.choice).toBe("accepted");
  expect((await choices(page))[1]?.choice).toBe("declined");
});

test("native app: browsing and the X never accept, only Continuar does", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "ccr_platform", value: "native", url: baseURL! }]);
  await page.addInitScript(() => localStorage.setItem("ccr:native-first-run-onboarding:v12", "1"));
  await gotoOK(page, "/privacidad");
  await waitForInteractivePage(page);
  const banner = page.locator("[data-cookie-banner]");
  await expect(banner).toBeVisible();
  await page.locator("footer a[href$='/terminos']").first().click().catch(() => undefined);
  await page.getByRole("button", { name: /^(Cerrar|Close)$/ }).click();
  expect(await choices(page)).toEqual([null, null]);
});
