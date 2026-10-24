import { test, expect, type Page, type BrowserContext } from "playwright/test";
import { gotoOK, loginAs, expectNoHorizontalOverflow, waitForInteractivePage } from "./helpers";
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

for (const target of ["/promociones/publicar", "/empleos/publicar", "/dashboard/profesional?tab=photos&nuevo=1"]) {
  test(`Create keeps the current screen covered until ${target} arrives`, async ({ page, context }) => {
    test.skip(!canRunSeededRegression(), "Requires isolated regression accounts.");
    await context.addCookies(authCookies);
    await enableNative(page, context);
    // Other regression runs leave contact follow-ups on this shared actor.
    // Keep this navigation check independent from those separate dialogs.
    await page.route("**/api/contact/follow-up", (route) => route.fulfill({ json: { followUp: null, pendingCount: 0 } }));
    await gotoOK(page, target.startsWith("/dashboard") ? "/dashboard/profesional?tab=cuenta" : "/profesionales");
    await waitForInteractivePage(page);
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


test("Project opens its own form and Back returns to the original section", async ({ page, context }) => {
  test.skip(!canRunSeededRegression(), "Requires isolated regression accounts.");
  await context.addCookies(authCookies);
  await enableNative(page, context);
  await page.route("**/api/contact/follow-up", (route) => route.fulfill({ json: { followUp: null, pendingCount: 0 } }));
  await gotoOK(page, "/dashboard/profesional?tab=cuenta");
  await waitForInteractivePage(page);
  await page.locator("nav.ccr-native-bottom-nav").getByRole("button", { name: "Crear", exact: true }).click();
  await page.getByTestId("native-create-sheet").locator('a[href^="/publicar-proyecto"]').click();
  await expect(page).toHaveURL(/\/publicar-proyecto\?returnTo=/);
  const form = page.getByRole("dialog");
  await expect(form).toBeVisible();
  await expect(form.getByText('Tu proyecto sale con "Verificado". El número no se muestra.')).toHaveCount(0);
  await expect(form.locator('[data-cedula-de-la-cuenta]')).toHaveCount(0);
  await expect(form.locator('input[type="tel"]')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await form.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(page).toHaveURL(/tab=cuenta/);
  await expect(form).toHaveCount(0);
});

test("Completion opens the profile subsection without painting its menu first", async ({ page, context }) => {
  test.skip(!canRunSeededRegression(), "Requires isolated regression accounts.");
  await context.addCookies(authCookies);
  const mobile = test.info().project.name !== "chromium-desktop";
  if (mobile) await enableNative(page, context);
  await page.route("**/api/contact/follow-up", (route) => route.fulfill({ json: { followUp: null, pendingCount: 0 } }));
  // Keep the persisted regression account intact; only its browser response has a missing bio.
  await page.route("**/rest/v1/professionals?*", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const missingBio = (row: Record<string, unknown>) => ({ ...row, bio: "", description: "" });
    await route.fulfill({ response, json: Array.isArray(data) ? data.map(missingBio) : missingBio(data) });
  });
  await gotoOK(page, "/dashboard/profesional?mode=offer&tab=completion");
  await waitForInteractivePage(page);
  const step = page.getByRole("button", { name: /Escribe una descripción/ });
  await expect(step).toBeVisible();
  await page.evaluate(() => {
    const state = window as typeof window & { completionFrames?: boolean[]; stopCompletionFrames?: boolean };
    state.completionFrames = [];
    const sample = () => {
      const section = document.getElementById("sec-basic");
      if (section) state.completionFrames!.push(section.querySelector('button[aria-expanded]')?.getAttribute("aria-expanded") === "true");
      if (!state.stopCompletionFrames) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await step.click();
  await expect(page.locator("#sec-basic textarea")).toBeVisible();
  const frames = await page.evaluate(() => {
    const state = window as typeof window & { completionFrames?: boolean[]; stopCompletionFrames?: boolean };
    state.stopCompletionFrames = true;
    return state.completionFrames ?? [];
  });
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.every(Boolean), "Every painted profile frame opens directly at the requested subsection").toBe(true);
  if (mobile) {
    await page.getByRole("banner").getByRole("button", { name: "Volver", exact: true }).click();
    await expect(page).toHaveURL(/tab=completion/);
    await expect(step).toBeVisible();
  }
  await expectNoHorizontalOverflow(page);
});


test("Project form keeps search prefills and safely closes on desktop", async ({ page }) => {
  await gotoOK(page, "/publicar-proyecto?categoria=electricidad&provincia=heredia&returnTo=%2Fprofesionales");
  const form = page.getByRole("dialog");
  await expect(form).toBeVisible();
  await expect(form.getByText('Tu proyecto sale con "Verificado". El número no se muestra.')).toHaveCount(0);
  await expect(form.locator('input[type="tel"]')).toBeVisible();
  await form.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(page).toHaveURL(/\/profesionales$/);
});
