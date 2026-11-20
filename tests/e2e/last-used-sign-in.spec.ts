import { test, expect } from "playwright/test";

for (const native of [false, true]) {
  test(`last used stays local and identifies exactly one method (${native ? "native" : "web"})`, async ({ page, context, baseURL }, testInfo) => {
    if (native) await context.addCookies([{ name: "ccr_platform", value: "native", url: baseURL! }]);
    if (native) await page.addInitScript(() => localStorage.setItem("ccr:native-first-run-onboarding:v12", "1"));
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Ingresa a tu cuenta/ })).toBeVisible();
    await expect(page.locator("[data-last-used]")).toHaveCount(0);
    for (const method of ["google", "apple", "email"]) {
      await context.addCookies([{ name: "ccr_last_sign_in", value: method, url: baseURL! }]);
      await page.reload();
      await expect(page.locator("[data-last-used]")).toHaveCount(1);
      await expect(page.locator(`[data-last-used="${method}"]`)).toHaveText("Último usado");
      await expect(page.getByRole("button", { name: /Continuar con Google/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /Continuar con Apple/ })).toBeVisible();
      if (method === "google") await page.screenshot({ path: `/tmp/last-used-${testInfo.project.name}-${native ? "native" : "web"}.png`, fullPage: true });
    }
    await page.goto("/en/login");
    await expect(page.locator("[data-last-used=email]")).toHaveText("Last used");
    await context.addCookies([{ name: "ccr_last_sign_in", value: "invalid", url: baseURL! }]);
    await page.reload();
    await expect(page.locator("[data-last-used]")).toHaveCount(0);
  });
}
