import { expect, type Locator, type Page, type TestInfo } from "playwright/test";

export async function gotoOK(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response, `Expected a response for ${path}`).not.toBeNull();
  expect(response!.status(), `Expected ${path} to return < 400`).toBeLessThan(400);
  await page.locator("body").waitFor({ state: "visible", timeout: 5_000 });
  await expectNotVercelProtection(page, path);
}

export async function expectNotVercelProtection(page: Page, path = page.url()) {
  const bodyText = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");
  const isVercelLogin = /Log in to Vercel|Continue with GitHub|Continue with SAML SSO/i.test(bodyText);
  expect(
    isVercelLogin,
    `${path} opened Vercel's protected login page instead of ContrataCR. Check VERCEL_AUTOMATION_BYPASS_SECRET and redeploy the test branch after rotating it.`,
  ).toBe(false);
}

export async function expectPageShell(page: Page) {
  await expect(page.locator("body")).toContainText(/ContrataCR/i);
  await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/i);
  const bodyText = (await page.locator("body").innerText()).trim();
  expect(bodyText.length, "Page should render meaningful content").toBeGreaterThan(20);
}

export async function expectHealthyPage(page: Page) {
  await expectNotVercelProtection(page);
  await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error|Log in to Vercel/i);
  await expectNoHorizontalOverflow(page);
}

export async function expectVisibleText(scope: Locator, matcher: string | RegExp, timeout = 12_000) {
  const matches = scope.getByText(matcher);
  await expect
    .poll(
      async () => {
        const count = await matches.count();
        for (let i = 0; i < count; i += 1) {
          if (await matches.nth(i).isVisible()) return true;
        }
        return false;
      },
      { timeout, message: `Expected visible text matching ${String(matcher)}` },
    )
    .toBe(true);
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
  await page.locator("body").waitFor({ state: "visible", timeout: 5_000 });
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
