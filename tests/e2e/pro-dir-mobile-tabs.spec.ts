import { test, expect, type Page } from "playwright/test";
import { isMobileProject } from "./helpers";

// IA 2026-11-21: with the directory ON, the native app bottom bar is Inicio, Servicios, Lugares, Solicitudes, Cuenta
// (NativeBottomNav, data-directory-tabs). Mobile web never gets it; with the directory OFF the classic icon bar stays.
// The directory flag is detected from /restaurantes (404 while DIR_ENABLED is off), so the spec is valid in both setups.
async function nativeShell(page: Page, baseURL: string) {
  await page.context().addCookies([{ name: "ccr_platform", value: "native", url: baseURL }]);
  await page.addInitScript(() => {
    localStorage.setItem("ccr:native-first-run-onboarding:v12", "1");
    const runtime: Record<string, unknown> = { isNativePlatform: () => true };
    Object.defineProperty(window, "Capacitor", {
      configurable: true,
      get: () => runtime,
      set: (v) => { if (v && typeof v === "object") Object.assign(runtime, v); runtime.isNativePlatform = () => true; },
    });
  });
}
const directoryOn = async (page: Page) => (await page.request.get("/restaurantes")).status() === 200;

test.describe("directory app tabs", () => {
  test.beforeEach(({}, testInfo) => { test.skip(!isMobileProject(testInfo), "Mobile projects only"); });

  test("native shell: five tabs with the right hrefs, or the classic bar when the directory is off", async ({ page, baseURL }) => {
    await nativeShell(page, baseURL!);
    const on = await directoryOn(page);
    await page.goto("/");
    const nav = page.locator("nav.ccr-native-bottom-nav");
    await expect(nav).toBeVisible();
    if (!on) { await expect(page.locator("[data-directory-tabs]")).toHaveCount(0); return; }
    const tabs = nav.locator("[data-native-tab]");
    await expect(tabs).toHaveCount(6);
    await expect(tabs.nth(0)).toHaveAttribute("href", "/");
    await expect(tabs.nth(1)).toHaveAttribute("href", "/profesionales");
    await expect(tabs.nth(2)).toHaveAttribute("href", "/servicios");
    await expect(tabs.nth(3)).toHaveAttribute("href", "/solicitudes");
    await expect(tabs.nth(4)).toHaveAttribute("href", /\/login/);
    await expect(tabs.nth(5)).toHaveAttribute("href", /\/login/);
    await expect(tabs.nth(0)).toHaveAttribute("aria-current", "page");
    for (let i = 0; i < 6; i++) {
      const box = await tabs.nth(i).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await expect(tabs.nth(1)).toContainText(/Servicios|Services/);
  });

  test("native shell: hidden on place pages so it never covers their contact bar", async ({ page, baseURL }) => {
    await nativeShell(page, baseURL!);
    test.skip(!(await directoryOn(page)), "Directory is off");
    await page.goto("/lugar/e2e-sin-lugar");
    await expect(page.locator("[data-directory-tabs]")).toHaveCount(0);
  });

  test("outside the native shell (mobile web) the tabs are never rendered", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-directory-tabs]")).toHaveCount(0);
  });
});
