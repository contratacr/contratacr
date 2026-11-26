import { completeAdminMfa } from "./admin-mfa-helper";
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

/** Chromium, Firefox and WebKit wording for a request the browser cancelled itself. */
export function isNavigationCancellation(errorText: string) {
  return /net::ERR_ABORTED|NS_BINDING_ABORTED|^Load request cancelled$|^cancelled$/i.test(errorText.trim());
}

const WEBKIT_CANCELLED_FETCH = /^(?:Fetch API cannot load )?(?:(https?):)?\/{0,2}([^\s/]+)(\/\S*)? due to access control checks\.?$/;
/** Playwright splits WebKit console errors at the first ":" into name/message
 * (`name="Fetch API cannot load http"`, `message="/host:port/path due to …"`),
 * and the name is not always kept. Rebuild the URL from the message alone; the
 * scheme defaults to the page's. */
function cancelledFetchUrl(error: { name: string; message: string }, pageUrl: string) {
  const match = WEBKIT_CANCELLED_FETCH.exec(error.message.trim());
  if (!match) return null;
  try {
    const scheme = match[1] ?? /^Fetch API cannot load (https?)$/.exec(error.name)?.[1] ?? new URL(pageUrl).protocol.replace(":", "");
    return new URL(`${scheme}://${match[2]}${match[3] ?? ""}`).href;
  } catch {
    return null;
  }
}
/** How long after a main-frame navigation starts WebKit may still report the
 * requests of the replaced document. */
const NAVIGATION_CANCEL_WINDOW_MS = 5_000;

const navigationTrackers = new WeakMap<Page, { navigations: number[]; cancelledUrls: Set<string> }>();
function trackNavigation(page: Page) {
  let tracker = navigationTrackers.get(page);
  if (tracker) return tracker;
  const created = { navigations: [] as number[], cancelledUrls: new Set<string>() };
  navigationTrackers.set(page, created);
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) created.navigations.push(Date.now());
  });
  page.on("requestfailed", (request) => {
    if (isNavigationCancellation(request.failure()?.errorText ?? "")) created.cancelledUrls.add(request.url());
  });
  tracker = created;
  return tracker;
}

function isFetchCancelledByNavigation(page: Page, error: { name: string; message: string }, at: number, pageUrl: string) {
  const url = cancelledFetchUrl(error, pageUrl);
  if (!url) return false;
  const tracker = trackNavigation(page);
  // Round 9: the app's own loopback Supabase (NEXT_PUBLIC_SUPABASE_URL = http://127.0.0.1:54321 in the
  // local suite) is the app's backend, not a third-party origin; its requests cancelled by a document
  // navigation are the same benign WebKit report. Any other cross-origin error is kept.
  let ownBackend = false;
  try {
    const target = new URL(url), local = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;
    ownBackend = !!local && local.hostname === "127.0.0.1" && target.origin === local.origin;
    if (target.origin !== new URL(pageUrl).origin && !ownBackend) return false;
  } catch {
    return false;
  }
  if (tracker.cancelledUrls.has(url)) return true;
  // WebKit may deliver the message just before or after the navigation event.
  return tracker.navigations.some((started) => at - started <= NAVIGATION_CANCEL_WINDOW_MS && started - at <= 1_000);
}

/**
 * Collect `pageerror` events without counting requests that the browser itself
 * cancelled because the page navigated or reloaded. WebKit reports such a
 * same-origin fetch as a JavaScript console error («Fetch API cannot load … due
 * to access control checks.»), which Playwright surfaces as `pageerror` even
 * when the application caught the rejection. Only that exact message is
 * ignored, and only when (a) the URL is same-origin with the page (a real
 * access-control failure is cross-origin) and (b) a main-frame navigation began
 * shortly before it or the same request failed with a cancellation error. Every
 * other page error, including a cross-origin access-control error, is kept.
 */
/**
 * Round 9: React's development-only performance tracks call `performance.measure()` while flushing the
 * first render; WebKit sometimes rejects those measures with «TypeError: Type error» from
 * `flushComponentPerformance` / `flushInitialRenderPerformance` (React internals, never in production
 * builds, no app frame in the stack). Only an error whose stack is exactly that React profiling path is
 * ignored; every other TypeError is kept. Chromium rejects the same dev-only measure with
 * «Failed to execute 'measure' on 'Performance': '<Component>' cannot have a negative time stamp.»; same
 * stack rule.
 */
export function isReactDevPerformanceTrackError(error: { name: string; message: string; stack?: string }) {
  const stack = error.stack ?? "";
  return error.name === "TypeError" && (/^Type error$/.test(error.message) || /^Failed to execute 'measure' on 'Performance': '[^']*' cannot have a negative time stamp\.$/.test(error.message)) && /\bat (?:measure \(.*\)\s+at )?flushComponentPerformance\b/.test(stack) && /flush(?:Initial)?\w*Performance/.test(stack) && !/\/src\/|webpack-internal:\/\/\/\.\/src\//.test(stack);
}
/** Round 9: per-spec page-error collectors share the same narrow noise rules as collectPageErrors
 * (navigation-cancelled fetches of the app or its loopback Supabase, React dev performance tracks). */
export function onAppPageError(page: Page, record: (message: string) => void) {
  trackNavigation(page);
  hideNextDevOverlay(page);
  page.on("pageerror", (error) => {
    if (isReactDevPerformanceTrackError(error) || isFetchCancelledByNavigation(page, error, Date.now(), page.url())) return;
    record(error.message);
  });
}
export function collectPageErrors(page: Page) {
  trackNavigation(page);
  const errors: { error: { name: string; message: string }; at: number; pageUrl: string }[] = [];
  page.on("pageerror", (error) => { if (!isReactDevPerformanceTrackError(error)) errors.push({ error: { name: error.name, message: error.message }, at: Date.now(), pageUrl: page.url() }); });
  return () => errors.filter((entry) => !isFetchCancelledByNavigation(page, entry.error, entry.at, entry.pageUrl)).map((entry) => entry.error.message);
}

/**
 * Keep render checks honest: a page can look fine while React, an API request,
 * or a server component failed in the background. The guard is installed on
 * the first navigation and `expectHealthyPage` reports everything collected.
 */
/** Closing round: the Next.js dev overlay (<nextjs-portal>, development only) can float over a phone-width footer and
 * intercept clicks (WebKit's dev-only React profiling «Type error» opens its issue toast). It is not app UI: hide it
 * from layout only; its DOM stays readable and page errors are still collected. Applies to later navigations. */
const overlayHidden = new WeakSet<Page>();
export function hideNextDevOverlay(page: Page) {
  if (overlayHidden.has(page)) return;
  overlayHidden.add(page);
  void page.addInitScript(() => {
    const hide = () => { if (document.getElementById("e2e-hide-next-dev-overlay")) return; const style = document.createElement("style"); style.id = "e2e-hide-next-dev-overlay"; style.textContent = "nextjs-portal{display:none!important}"; (document.head ?? document.documentElement).appendChild(style); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hide, { once: true }); else hide();
  }).catch(() => undefined);
}
/** Closing round: WebKit can deliver a late navigation of the previous document (dev-server reload or a client redirect)
 * that interrupts the next page.goto. Same single retry as gotoOK, for specs that navigate with page.goto directly. */
const gotoRetried = new WeakSet<Page>();
export function retryInterruptedNavigation(page: Page) {
  if (gotoRetried.has(page)) return page;
  gotoRetried.add(page);
  const goto = page.goto.bind(page);
  page.goto = (async (url: string, options?: Parameters<Page["goto"]>[1]) => {
    try { return await goto(url, options); }
    catch (error) {
      if (!(error instanceof Error) || !/interrupted by another navigation/i.test(error.message)) throw error;
      await page.waitForLoadState("load").catch(() => undefined);
      return goto(url, options);
    }
  }) as Page["goto"];
  return page;
}
export function installRuntimeGuards(page: Page) {
  if (guardedPages.has(page)) return;
  guardedPages.add(page);
  const issues: string[] = [];
  runtimeIssues.set(page, issues);

  trackNavigation(page);
  page.on("pageerror", (error) => {
    if (isFetchCancelledByNavigation(page, error, Date.now(), page.url()) || isReactDevPerformanceTrackError(error)) return;
    issues.push(`pageerror: ${error.message}`);
  });
  hideNextDevOverlay(page);
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
    if (isNavigationCancellation(failure)) return;
    if (isLocalGoogleMapsKeyRestriction(page, request.url())) return;
    issues.push(`requestfailed: ${request.method()} ${request.url()} (${failure})`);
  });
}

// Third-party scripts and stock imagery (Meta pixel, Unsplash, analytics
// collectors) are not part of the product contract and make `load`-based waits
// depend on someone else's latency. Keep them off the wire during regression.
const THIRD_PARTY_HOSTS = /^(?:connect\.facebook\.net|www\.facebook\.com|images\.unsplash\.com|[a-z0-9.-]+\.on\.aws)$/i;
const thirdPartyBlocked = new WeakSet<Page>();
export async function blockThirdParty(page: Page) {
  if (process.env.E2E_ALLOW_THIRD_PARTY === "1" || thirdPartyBlocked.has(page)) return;
  thirdPartyBlocked.add(page);
  await page.route((url) => THIRD_PARTY_HOSTS.test(url.hostname), (route) => route.abort("blockedbyclient"));
}

export async function gotoOK(page: Page, path: string) {
  installRuntimeGuards(page);
  await blockThirdParty(page);
  // A full navigation aborts requests from the document being replaced. Reset
  // at the new document's commit so those expected aborts cannot contaminate
  // the health contract for the page we are actually asserting.
  runtimeIssues.set(page, []);
  // Safari (WebKit) puede recibir TARDE una navegación de la página anterior
  // —p. ej. la portada que vuelve a «/» al notar que se cerró la sesión— y
  // cortar la nueva («interrupted by another navigation»). En Chrome esa
  // vuelta termina antes. Se reintenta una vez, ya sin nada pendiente.
  let response = await page.goto(path, { waitUntil: "commit" }).catch(async (error: Error) => {
    if (!/interrupted by another navigation/i.test(error.message)) throw error;
    await page.waitForLoadState("load").catch(() => undefined);
    return page.goto(path, { waitUntil: "commit" });
  });
  if (response === null && page.url().endsWith(path)) response = await page.goto(path, { waitUntil: "commit" });
  runtimeIssues.set(page, []);
  await page.waitForLoadState("domcontentloaded");
  expect(response, `Expected a response for ${path}`).not.toBeNull();
  expect(response!.status(), `Expected ${path} to return < 400`).toBeLessThan(400);
  await page.locator("body").waitFor({ state: "visible", timeout: 5_000 });
  await expectNotVercelProtection(page, path);
  // Next.js can commit a streamed document before its route is ready. Require
  // either meaningful content or the intentional full-page loading mark; a
  // merely visible <body> can still be a completely white frame.
  await expectVisibleRouteShell(page, path);
}

export async function expectNotVercelProtection(page: Page, path = page.url()) {
  const bodyText = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");
  const isVercelLogin = /Log in to Vercel|Continue with GitHub|Continue with SAML SSO/i.test(bodyText);
  expect(
    isVercelLogin,
    `${path} opened Vercel's protected login page instead of ContrataCR. Check VERCEL_AUTOMATION_BYPASS_SECRET and redeploy the test branch after rotating it.`,
  ).toBe(false);
}

async function pageShellState(page: Page) {
  return page.evaluate(() => {
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
    // El esqueleto de una sección del panel (PanelSkeleton) también es un
    // estado de carga visible: anuncia aria-busy y role=status.
    const routeLoading = Array.from(document.querySelectorAll<HTMLElement>(".ccr-page-route-loading[aria-busy='true'], [role='status'][aria-busy='true']"))
      .some((node) => {
        const style = window.getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
      });

    return {
      // The server shell can paint the persistent native/header chrome before
      // a client-only route hydrates its <main>. That is a visible, non-blank
      // response and the route-specific assertions below still wait for the
      // interactive main content. Do not mistake that valid shell for a blank
      // document merely because <main> has not hydrated yet.
      ready: mainText.length > 20 || bodyText.length > 40,
      loading: routeLoading,
    };
  });
}

async function expectVisibleRouteShell(page: Page, path: string) {
  await expect
    .poll(
      async () => {
        try {
          const state = await pageShellState(page);
          return state.ready || state.loading;
        } catch {
          return false;
        }
      },
      {
        timeout: 5_000,
        message: `${path} should render content or a visible loading state instead of a blank page`,
      },
    )
    .toBe(true);
}

export async function expectPageShell(
  page: Page,
  { timeout = 8_000, label = page.url() }: { timeout?: number; label?: string } = {},
) {
  const body = page.locator("body");
  await expect
    .poll(
      async () => {
        try {
          return (await pageShellState(page)).ready;
        } catch {
          // A streamed redirect can replace the execution context between
          // polls. Retry the complete, atomic snapshot on the new document.
          return false;
        }
      },
      {
        timeout,
        message: `${label} should replace the visible loading state with meaningful main content`,
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
  const navbar = page.getByTestId("landing-navbar").first();
  if (await navbar.count()) await expect(navbar).toHaveAttribute("data-hydrated", "true");
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
  const size = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    // Qué se sale, para no adivinar desde el CI: los elementos más anchos que la pantalla.
    // Lo que vive dentro de un carril con desplazamiento propio (overflow-x
    // auto/hidden/scroll) no ensancha el documento: se descarta.
    const dentroDeCarril = (el: HTMLElement) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX)) return true;
      }
      return false;
    };
    const seSale = (el: Element) => el.getBoundingClientRect().right > clientWidth + 1 && el.getBoundingClientRect().width > 0;
    // Solo los culpables RAÍZ: los que se salen sin que su padre se salga. Un
    // formulario entero a 397 px señala a su contenedor, no a cada campo.
    const culpables = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((el) => seSale(el) && !dentroDeCarril(el) && !(el.parentElement && el.parentElement !== document.body && seSale(el.parentElement)))
      .slice(0, 5)
      .map((el) => {
        const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
        return `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 4).join(".")} x=${Math.round(r.x)} w=${Math.round(r.width)} css(w=${cs.width} pad=${cs.paddingLeft}/${cs.paddingRight} mar=${cs.marginLeft}/${cs.marginRight} pos=${cs.position}) «${(el.textContent ?? "").trim().slice(0, 30)}»`;
      });
    const medidas = `innerWidth=${window.innerWidth} html=${document.documentElement.getBoundingClientRect().width} body=${document.body.getBoundingClientRect().width} main=${document.querySelector("main")?.getBoundingClientRect().width ?? "-"}`;
    return { clientWidth, scrollWidth: document.documentElement.scrollWidth, culpables: [medidas, ...culpables] };
  });
  expect(size.scrollWidth, `Page should not overflow horizontally (${page.url()}): ${size.culpables.join(" | ")}`).toBeLessThanOrEqual(size.clientWidth + 4);
}

export async function openLoginForm(page: Page) {
  const portada = page.locator(".ccr-login-portada");
  if (!(await portada.isVisible().catch(() => false))) return;
  await portada.getByRole("button", { name: /Inicie sesión|Log in/i }).first().click();
  await page.locator("main form").first().waitFor({ state: "visible", timeout: 10_000 });
}

export async function loginAs(page: Page, email: string, password: string, options: { adminMfa?: boolean } = {}) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await resetAuth(page);
    await gotoOK(page, "/login");
    await waitForInteractivePage(page);
    await openLoginForm(page);

    const main = page.locator("main");
    await expectVisibleText(main, /Ingrese a su cuenta|Log in to your account|Bienvenido de vuelta|Welcome back/i);
    await main.locator('input[type="email"]').fill(email);
    await main.locator('input[type="password"]').fill(password);
    const terms = main.getByRole("checkbox");
    if (await terms.isVisible()) await terms.check();
    await main.getByRole("button", { name: /Ingresar|Sign in/i }).first().click();

    try {
      await page.waitForURL(/(?:\/en)?\/dashboard\/profesional/, { timeout: 30_000, waitUntil: "domcontentloaded" });
      await expectAuthCookie(page);
      await page.locator("body").waitFor({ state: "visible", timeout: 5_000 });
      // The URL commits before the dashboard resolves Auth/bootstrap and its
      // initial route effects. Starting another navigation at that point races
      // those effects, which WebKit reports as an internal navigation error.
      await expect(page.getByRole("main").getByRole("heading", { level: 1 }).filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
      if (options.adminMfa !== false) {
        const state = await (await page.request.get("/api/auth/admin-mfa", { maxRetries: 2 })).json();
        if (state.isAdmin && state.required) {
          const destination = new URL(page.url()).pathname + new URL(page.url()).search;
          await gotoOK(page, "/admin");
          await completeAdminMfa(page, email);
          await gotoOK(page, destination);
        }
      }
      return;
    } catch (error) {
      lastError = error;
      if (!/(?:\/en)?\/login\?/.test(page.url())) break;
    }
  }
  throw lastError;
}

export async function resetAuth(page: Page) {
  // Signing out never changes the device: the app's platform cookie survives.
  const platform = (await page.context().cookies()).find((cookie) => cookie.name === "ccr_platform");
  // Unmount protected-route effects before clearing auth cookies. Otherwise a
  // delayed auth redirect can interrupt WebKit's reset navigation. Commit a
  // blank document first so the protected page cannot schedule another redirect.
  await page.goto("about:blank", { waitUntil: "commit" });
  await page.goto("/robots.txt", { waitUntil: "domcontentloaded" });
  await page.context().clearCookies();
  if (platform) await page.context().addCookies([{ name: platform.name, value: platform.value, domain: platform.domain, path: platform.path }]);
  // Same-origin text gives access to storage without mounting the whole home,
  // starting its carousel/media or reviving cached auth during fixture reset.
  await page.evaluate(() => {
    const privacy = ["analytics", "advertising"].map(purpose => { const key = `contratacr:consent:${purpose}:v1`; return [key, localStorage.getItem(key)] as const; });
    localStorage.clear();
    sessionStorage.clear();
    // Reset authentication, not the separate device preference.
    for (const [key,value] of privacy) if (value) localStorage.setItem(key,value);
  });
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
  await gotoOK(page, "/profesionales");
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
    // Las cuentas desechables de otras pruebas pueden seguir en la lista hasta
    // que vence su caché (5 min) aunque ya se hayan borrado: no sirven de muestra.
    if (href?.includes("/profesionales/") && !href.includes("?tab=") && !/regression-disposable|disposable-regression/i.test(href)) return href;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Independent Pro space (`/dashboard/pro`). «ContrataCR Pro» in Mi panel opens
// its own header (h1 = section label, ONE back button next to it: «Volver»/«Back» inside sections and
// «Volver a Mi panel»/«Back to My panel» on Inicio) instead of the global
// navbar's `[data-ccr-section-title]` / `[data-ccr-section-back]`.
// Shared so specs follow the same contract as `headerBack` in pro-navigation.
// ---------------------------------------------------------------------------
export const PRO_SPACE_HOME_URL = /\/dashboard\/pro(?:\?(?!.*\btab=)|$)/;

export function proSpaceUrl(tab: string) {
  return new RegExp(`/dashboard/pro\\?(?:.*&)?tab=${tab}(?:&|$)`);
}

export function proSpace(page: Page) {
  return page.locator("[data-independent-pro]");
}

/** Section heading of the independent Pro space («Inicio», «Clientes», …). */
export function proSpaceTitle(page: Page) {
  return proSpace(page).locator("main h1");
}

/** A button of the Pro hub (`[data-pro-tools]`), avoiding the desktop side menu twin. */
export function proHubButton(page: Page, name: string) {
  return page.locator("[data-pro-tools]").getByRole("button", { name, exact: true });
}

/** Header back of the independent Pro space: section → Inicio, Inicio → Mi panel. */
export async function proSpaceBack(page: Page, en = false) {
  const tab = new URL(page.url()).searchParams.get("tab") ?? "pro_tools";
  const name = tab === "pro_tools" ? (en ? "Back to My panel" : "Volver a Mi panel") : en ? "Back" : "Volver";
  await proSpace(page).getByRole("button", { name, exact: true }).click();
}

/** Sections in the Pro tab bar (below lg); the rest are under «Más» (the same list as the desktop side menu). */
const PRO_TAB_BAR_TABS = ["pro_tools", "pro_agenda", "pro_clients", "quotes"];

/** The mobile Pro tab bar (`[data-pro-tab-bar]`, below 1024 px). */
export function proTabBar(page: Page) {
  return page.locator("[data-pro-tab-bar]");
}

/**
 * Opens a Pro section the way a person does at this width: the tab bar (or «Más» → the full list) below
 * 1024 px, the desktop side menu («Navegación del negocio») otherwise. `label` is the side-menu entry.
 * `dispatch` fires the click without pointer checks (to exercise navigation guards under a dialog).
 */
export async function proGoToSection(page: Page, tab: string, label: string, options: { en?: boolean; dispatch?: boolean } = {}) {
  const en = !!options.en;
  const press = async (target: Locator) => (options.dispatch ? target.dispatchEvent("click") : target.click());
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    if (PRO_TAB_BAR_TABS.includes(tab)) return press(proTabBar(page).locator(`[data-pro-tab="${tab}"]`));
    await press(proTabBar(page).locator('[data-pro-tab="more"]'));
    return press(page.locator("[data-pro-more-sections]").getByRole("button", { name: label, exact: true }));
  }
  return press(page.getByRole("navigation", { name: en ? "Business navigation" : "Navegación del negocio", exact: true }).getByRole("button", { name: label, exact: true }));
}

/** Leads (Solicitudes): secondary actions live in the «…» menu next to the title, as in Houzz Pro. */
export async function openLeadOption(page: Page, en: boolean, label: string) {
  await page.getByRole("button", { name: en ? "Lead options" : "Opciones de solicitudes", exact: true }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}

/** Opens the independent Pro space from Mi panel through «ContrataCR Pro». */
export async function openProSpaceFromPanel(page: Page, en = false) {
  await page.getByTestId("panel-tab-pro_tools").filter({ visible: true }).click();
  await expect(page).toHaveURL(PRO_SPACE_HOME_URL);
  await expect(page.locator("[data-pro-tools]")).toBeVisible({ timeout: 30_000 });
  await expect(proSpaceTitle(page)).toHaveText(en ? "Overview" : "Inicio");
}

/**
 * Compile cold dev routes before the timed part of a spec (webpack dev compiles
 * on first request; a first hit can exceed 12 s). Status must stay < 500 so a
 * real server error is not hidden; auth-dependent 401/403/405 are acceptable.
 */
export async function warmLocalRoutes(page: Page, paths: string[], timeout = 90_000) {
  for (const path of paths) {
    const response = await page.request.get(path, { timeout, maxRedirects: 0 }).catch(() => null);
    if (response) expect(response.status(), `Warm-up ${path}`).toBeLessThan(500);
  }
}
