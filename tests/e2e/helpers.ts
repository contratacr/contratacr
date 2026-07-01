import { expect, type Page, type TestInfo } from "playwright/test";

export async function gotoOK(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response, `Expected a response for ${path}`).not.toBeNull();
  expect(response!.status(), `Expected ${path} to return < 400`).toBeLessThan(400);
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
}

export async function expectPageShell(page: Page) {
  await expect(page.getByRole("link", { name: /ContrataCR/i }).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/i);
  const bodyText = (await page.locator("body").innerText()).trim();
  expect(bodyText.length, "Page should render meaningful content").toBeGreaterThan(20);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const size = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(size.scrollWidth, "Page should not overflow horizontally").toBeLessThanOrEqual(size.clientWidth + 4);
}

export function isMobileProject(testInfo: TestInfo) {
  return testInfo.project.name.toLowerCase().includes("mobile");
}

export async function firstProfessionalHref(page: Page) {
  await gotoOK(page, "/es/buscar");
  const links = page.locator('a[href*="/profesionales/"]');
  const count = await links.count();
  if (count === 0) return null;

  for (let i = 0; i < count; i += 1) {
    const href = await links.nth(i).getAttribute("href");
    if (href?.includes("/profesionales/") && !href.includes("?tab=")) return href;
  }
  return null;
}
