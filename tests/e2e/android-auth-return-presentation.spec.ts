import { test, expect } from "playwright/test";
import { androidOAuthReturnResponse } from "../../src/lib/auth/android-oauth-return";

for (const locale of ["es", "en"]) {
  test(`Apple Android return uses the principal logo and fixed app link (${locale})`, async ({ page }) => {
    const response = androidOAuthReturnResponse(new URLSearchParams({ native_state: "a".repeat(64), code: "synthetic-test-code", locale }));
    const body = await response.text();
    await page.route("**/__qa/android-return", route => route.fulfill({ status: 200, headers: Object.fromEntries(response.headers), body }));
    await page.goto("/__qa/android-return");
    const logo = page.getByRole("img", { name: "ContrataCR" });
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.getByRole("link")).toHaveAttribute("href", /^intent:\/\/contratacr\.com\/dashboard\/native-auth-return\?.*package=com\.contratacr\.app;end$/);
    await expect(page.getByRole("heading")).toHaveText(locale === "es" ? "Volver a ContrataCR" : "Return to ContrataCR");
  });
}
