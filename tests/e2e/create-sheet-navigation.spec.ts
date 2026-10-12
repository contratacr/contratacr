import { test, expect, type Page, type BrowserContext } from "playwright/test";
import { gotoOK, loginAs, expectNoHorizontalOverflow } from "./helpers";
import { canRunSeededRegression, E2E_USERS } from "./seed";

let authCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
test.beforeAll(async ({ browser }) => {
  if (!canRunSeededRegression()) return;
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL as string });
  const page = await context.newPage();
  await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
  authCookies = await context.cookies();
  await context.close();
});

async function enableNative(page: Page, context: BrowserContext) {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.addCookies([{ name: "ccr_platform", value: "native", url: test.info().project.use.baseURL as string }]);
  await page.addInitScript(() => {
    localStorage.setItem("ccr:native-first-run-onboarding:v12", "1");
    const runtime: Record<string, unknown> = { isNativePlatform: () => true };
    Object.defineProperty(window, "Capacitor", {
      configurable: true,
      get: () => runtime,
      set: (value) => {
        if (value && typeof value === "object") Object.assign(runtime, value);
        runtime.isNativePlatform = () => true;
      },
    });
  });
}

for (const target of ["/publicar-proyecto", "/promociones/publicar", "/empleos/publicar", "/dashboard/profesional?tab=photos&nuevo=1"]) {
  test(`Create keeps the current screen covered until ${target} arrives`, async ({ page, context }) => {
    test.skip(!canRunSeededRegression(), "Requires isolated regression accounts.");
    await context.addCookies(authCookies);
    await enableNative(page, context);
    await gotoOK(page, target.startsWith("/dashboard") ? "/dashboard/profesional?tab=cuenta" : "/profesionales");
    await page.locator("nav.ccr-native-bottom-nav").getByRole("button", { name: "Crear", exact: true }).click();
    const sheet = page.getByTestId("native-create-sheet");
    const link = sheet.locator(`a[href="${target}"]`);
    await expect(link).toBeVisible();
    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    let received = false;
    const wanted = new URL(target, "https://contratacr.com");
    await page.route((url) => url.pathname === wanted.pathname && [...wanted.searchParams].every(([key, value]) => url.searchParams.get(key) === value), async (route) => {
      if (route.request().headers()["rsc"] === "1") { received = true; await hold; }
      await route.continue();
    });
    const before = page.url();
    try {
      await link.click();
      await expect.poll(() => received).toBe(true);
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("status", { name: "Cargando…" })).toBeVisible();
      expect(page.url()).toBe(before);
      await expectNoHorizontalOverflow(page);
    } finally { release(); }
    await expect(page).not.toHaveURL(before);
    await expect(sheet).toHaveCount(0);
    if (target.startsWith("/dashboard")) {
      await expect(page).toHaveURL(/tab=photos/);
      await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).first().click();
      // The persistent navigation must reopen a fresh sheet after a query-only navigation.
      await page.locator("nav.ccr-native-bottom-nav").getByRole("button", { name: "Crear", exact: true }).click();
      await expect(page.getByTestId("native-create-sheet")).toBeVisible();
      await page.getByTestId("native-create-sheet").locator(`a[href="${target}"]`).click();
      await expect(page.getByTestId("native-create-sheet")).toHaveCount(0);
    }
  });
}
