import { test, expect } from "playwright/test";
import { gotoOK, expectNoHorizontalOverflow, waitForInteractivePage } from "./helpers";

test("native home shows nearby professionals even if scroll observers never fire", async ({ page, context }) => {
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
    // Reproduce a suspended WebView that does not deliver scroll intersections.
    window.IntersectionObserver = class {
      observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
      root = null; rootMargin = "0px"; thresholds = [0];
    } as unknown as typeof IntersectionObserver;
  });
  await gotoOK(page, "/");
  const zones = page.locator(".ccr-fin-de-portada");
  await zones.scrollIntoViewIfNeeded();
  const heading = zones.getByRole("heading", { name: "Encuentra profesionales cerca de ti", exact: true });
  await expect(heading).toBeVisible();
  const invisibleAncestors = await heading.evaluate((el) => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      if (getComputedStyle(node).opacity === "0") return true;
    }
    return false;
  });
  expect(invisibleAncestors).toBe(false);
  const map = zones.getByRole("group", { name: "Mapa de Costa Rica por provincia", exact: true });
  await expect(map).toBeVisible();
  expect(await map.getByRole("button").count()).toBe(7);
  await waitForInteractivePage(page);
  await map.getByRole("button", { name: "Heredia", exact: true }).click();
  await expect(map.getByRole("button", { name: "Heredia", exact: true })).toHaveAttribute("aria-pressed", "true");
  const finalControl = zones.getByRole("button", { name: "Usar mi ubicación", exact: true });
  await finalControl.scrollIntoViewIfNeeded();
  await expect(finalControl).toBeVisible();
  await expect.poll(() => finalControl.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })).toBe(true);
  await expectNoHorizontalOverflow(page);
});
