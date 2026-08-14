import { expect, type Locator, type Page, type TestInfo } from "playwright/test";

const runtimeIssues = new WeakMap<Page, string[]>();
const guardedPages = new WeakSet<Page>();

function isLoopbackPage(page: Page) {
  try {
    const hostname = new URL(page.url()).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function isLocalGoogleMapsKeyRestriction(page: Page, diagnostic: string) {
  if (!isLoopbackPage(page)) return false;
  return /maps\.googleapis\.com\/(?:maps\/api\/mapsjs\/gen_204|\$rpc\/google\.internal\.maps\.mapsjs\.v1\.MapsJsInternalService\/GetViewportInfo)/i.test(diagnostic)
    || /Google Maps JavaScript API error:\s*RefererNotAllowedMapError/i.test(diagnostic);
}

function isLocalDevServerNoise(page: Page, diagnostic: string) {
  return isLoopbackPage(page)
    && /WebSocket connection to ['"]ws:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/_next\/webpack-hmr[^'"]*['"] failed:/i.test(diagnostic);
}

/**
 * Keep render checks honest: a page can look fine while React, an API request,
 * or a server component failed in the background. The guard is installed on
 * the first navigation and `expectHealthyPage` reports everything collected.
 */
export function installRuntimeGuards(page: Page) {
  if (guardedPages.has(page)) return;
  guardedPages.add(page);
  const issues: string[] = [];
  runtimeIssues.set(page, issues);

  page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const value = message.text();
    // Browser extensions and cancelled navigations are outside the app.
    if (/chrome-extension:|ResizeObserver loop limit exceeded/i.test(value)) return;
    if (isLocalDevServerNoise(page, value)) return;
    // The shared test key is intentionally restricted to deployed domains.
    // Ignore only its two known Google probes on loopback; the same failure on
    // test.contratacr.com remains a regression failure.
    if (isLocalGoogleMapsKeyRestriction(page, `${value} ${message.location().url}`)) return;
    issues.push(`console.error: ${value}`);
  });
  page.on("response", (response) => {
    if (response.status() < 500) return;
    issues.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "request failed";
    if (/ERR_ABORTED|NS_BINDING_ABORTED/i.test(failure)) return;
    if (isLocalGoogleMapsKeyRestriction(page, request.url())) return;
    issues.push(`requestfailed: ${request.method()} ${request.url()} (${failure})`);
  });
}

export async function gotoOK(page: Page, path: string) {
  installRuntimeGuards(page);
  // A full navigation aborts requests from the document being replaced. Reset
  // at the new document's commit so those expected aborts cannot contaminate
  // the health contract for the page we are actually asserting.
  runtimeIssues.set(page, []);
  const response = await page.goto(path, { waitUntil: "commit" });
  runtimeIssues.set(page, []);
  await page.waitForLoadState("domcontentloaded");
  expect(response, `Expected a response for ${path}`).not.toBeNull();
  expect(response!.status(), `Expected ${path} to return < 400`).toBeLessThan(400);
  await page.locator("body").waitFor({ state: "visible", timeout: 5_000 });
  await expectNotVercelProtection(page, path);
  // Next.js can commit a streamed document before its visible route shell has
  // replaced the fallback. Waiting for a merely visible <body> lets tests race
  // a completely blank frame (and mirrors the white panel users reported).
  await expectPageShell(page);
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
  const body = page.locator("body");
  await expect
    .poll(
      async () => {
        try {
          return await page.evaluate(() => {
            const bodyText = document.body?.innerText.trim() ?? "";
            const mainText = Array.from(document.querySelectorAll("main"))
              .filter((main) => {
                const style = window.getComputedStyle(main);
                const box = main.getBoundingClientRect();
                return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
              })
              .map((main) => (main as HTMLElement).innerText)
              .join(" ")
              .trim();
            return mainText.length > 20 && /ContrataCR/i.test(bodyText);
          });
        } catch {
          // A streamed redirect can replace the execution context between
          // polls. Retry the complete, atomic snapshot on the new document.
          return false;
        }
      },
      {
        timeout: 8_000,
        message: "Page should replace the streamed loading fallback with meaningful main content",
      },
    )
    .toBe(true);
  await expect(body).not.toContainText(/Application error|Internal Server Error/i);
}

export async function expectHealthyPage(page: Page) {
  await expectNotVercelProtection(page);
  await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error|Log in to Vercel/i);
  await expectNoRawI18nKeys(page);
  await expectNoHorizontalOverflow(page);
  const issues = runtimeIssues.get(page) ?? [];
  expect(issues, `The page reported silent runtime failures:\n${issues.join("\n")}`).toEqual([]);
}

export async function expectNoRawI18nKeys(page: Page) {
  const bodyText = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");
  const rawKey = bodyText.match(
    /\b(?:servicesPage|categoriesPage|clientActivity|schedule|categories|dashboard|card|proPanel|selfAction|unsavedGuard|search|verificationPanel|notifications|comoFunciona|ayuda|atraerClientes|supportTickets|savedPros|clientPage)\.[A-Za-z0-9_.-]+/i,
  )?.[0] ?? "";
  expect(rawKey, `UI should not expose raw translation key "${rawKey}"`).toBe("");
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

export async function waitForInteractivePage(page: Page) {
  await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function expectAuthCookie(page: Page) {
  await expect
    .poll(
      async () => {
        const cookies = await page.context().cookies();
        return cookies.some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"));
      },
      { timeout: 8_000, message: "Expected Supabase auth cookie after login" },
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
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await resetAuth(page);
    await gotoOK(page, "/es/login");
    await waitForInteractivePage(page);

    const main = page.locator("main");
    await expectVisibleText(main, /Bienvenido de vuelta|Welcome back/i);
    await main.locator('input[type="email"]').fill(email);
    await main.locator('input[type="password"]').fill(password);
    await main.getByRole("button", { name: /Ingresar|Sign in/i }).first().click();

    try {
      await page.waitForURL(/\/(?:es|en)\/dashboard\/profesional/, { timeout: 30_000 });
      await expectAuthCookie(page);
      await page.locator("body").waitFor({ state: "visible", timeout: 5_000 });
      return;
    } catch (error) {
      lastError = error;
      if (!/\/(?:es|en)\/login\?/.test(page.url())) break;
    }
  }
  throw lastError;
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
  const links = page.locator('a[href*="/profesionales/"]').filter({ visible: true });

  await expect
    .poll(
      async () => await links.count(),
      {
        timeout: 12_000,
        message: "The verified production mirror should finish streaming at least one professional result",
      },
    )
    .toBeGreaterThan(0);

  const count = await links.count();
  for (let i = 0; i < count; i += 1) {
    const href = await links.nth(i).getAttribute("href");
    if (href?.includes("/profesionales/") && !href.includes("?tab=")) return href;
  }
  return null;
}
