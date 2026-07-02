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

export async function loginAs(page: Page, email: string, password: string) {
  await resetAuth(page);
  await gotoOK(page, "/es/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /Ingresar|Sign in/i }).click();
  await page.waitForURL(/\/(?:es|en)\/dashboard\/profesional/, { timeout: 20_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
}

export async function resetAuth(page: Page) {
  await page.context().clearCookies();
  await page.goto("/es", { waitUntil: "domcontentloaded" }).catch(() => undefined);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  }).catch(() => undefined);
}

export async function apiJson<T = unknown>(
  page: Page,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ path: requestPath, method, body }) => {
      const response = await fetch(requestPath, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      return { status: response.status, body: parsed };
    },
    { path, method: options.method ?? "GET", body: options.body },
  ) as Promise<{ status: number; body: T }>;
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
