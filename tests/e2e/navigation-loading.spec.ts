import { test, expect } from "playwright/test";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";
import { regressionAdminClient } from "./seed";
import { gotoOK, loginAs, expectNoHorizontalOverflow } from "./helpers";

const isolated = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes("oqheayqqprpciqdvdaqo") && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
async function nativeShell(page: import("playwright/test").Page, context: import("playwright/test").BrowserContext) {
  await context.addCookies([{ name: "ccr_platform", value: "native", url: test.info().project.use.baseURL as string }]);
  await page.addInitScript(() => {
    localStorage.setItem("ccr:native-first-run-onboarding:v12", "1");
    const runtime: Record<string, unknown> = { isNativePlatform: () => true };
    Object.defineProperty(window, "Capacitor", { configurable: true, get: () => runtime, set: (value) => {
      if (value && typeof value === "object") Object.assign(runtime, value);
      runtime.isNativePlatform = () => true;
    } });
  });
}

test("privacy keeps read receipts and blocked users warm through repeated entries", async ({ page, context }) => {
  test.skip(!isolated, "Isolated test database required");
  test.setTimeout(180_000);
  let account: DisposableAccount | undefined;
  try {
    await nativeShell(page, context);
    account = await createDisposableAccount({ prefix: "warm-privacy" });
    await loginAs(page, account.email, account.password);
    await gotoOK(page, "/dashboard/profesional?tab=profile");
    await page.locator("#sec-privacidad > button").click();
    const privacy = page.locator("[data-account-privacy]");
    await expect(privacy.getByRole("switch")).toBeVisible();
    await expect(privacy.getByText("No has bloqueado a nadie.", { exact: true })).toBeVisible();
    await page.route("**/rest/v1/rpc/get_my_profile", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500)); await route.continue();
    });
    await page.route("**/api/block", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500)); await route.continue();
    });
    await page.evaluate(() => {
      const state = { stopped: false, flashes: 0 };
      (window as unknown as { __privacyPaint: typeof state }).__privacyPaint = state;
      const sample = () => {
        if (state.stopped) return;
        if (document.querySelector("[data-account-privacy] [aria-busy=true]")) state.flashes++;
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const repeats = test.info().project.name === "chromium-mobile" ? 50 : 5;
    for (let i = 0; i < repeats; i++) {
      if ((page.viewportSize()?.width ?? 0) < 640) {
        await page.getByRole("button", { name: /^Volver/ }).filter({ visible: true }).first().click();
      } else await page.locator("#sec-privacidad > button").click();
      await page.locator("#sec-privacidad > button").click();
      await expect(privacy.locator("[aria-busy=true]")).toHaveCount(0);
      await expect(privacy.getByRole("switch")).toBeVisible();
      await expect(privacy.getByText("No has bloqueado a nadie.", { exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => {
      const state = (window as unknown as { __privacyPaint: { stopped: boolean; flashes: number } }).__privacyPaint;
      state.stopped = true; return state.flashes;
    })).toBe(0);
    // Cached settings remain editable and the new value survives remount.
    const toggle = privacy.getByRole("switch");
    const before = await toggle.getAttribute("aria-checked");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");
    await expect(toggle).toBeEnabled();
    if ((page.viewportSize()?.width ?? 0) < 640) await page.getByRole("button", { name: /^Volver/ }).filter({ visible: true }).first().click();
    else await page.locator("#sec-privacidad > button").click();
    await page.locator("#sec-basic > button").click();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(await page.locator('#sec-basic input[type="text"]').first().inputValue()).toMatch(/^Cuenta desechable/);
    await expectNoHorizontalOverflow(page);
  } finally { await cleanupDisposableAccount(account); }
});

test("completion steps open their target without painting the profile menu", async ({ page, context }) => {
  test.skip(!isolated, "Isolated test database required");
  test.setTimeout(120_000);
  let account: DisposableAccount | undefined;
  try {
    await nativeShell(page, context);
    account = await createDisposableAccount({ prefix: "direct-completion", professional: true });
    const { error } = await regressionAdminClient().from("professionals").update({ bio: "", provincia_id: null, canton_id: null, social_links: {} }).eq("id", account.professionalId!);
    if (error) throw error;
    const { data: servicePro, error: serviceError } = await regressionAdminClient().from("professionals").select("services").eq("id", account.professionalId!).single();
    if (serviceError) throw serviceError;
    const services = servicePro.services.map((service: Record<string, unknown>) => ({ ...service, price: "", priceType: "por_hora", priceAmount: null, description: "", startedAt: null, years: null, months: null }));
    const { error: clearServices } = await regressionAdminClient().from("professionals").update({ services }).eq("id", account.professionalId!);
    if (clearServices) throw clearServices;
    await loginAs(page, account.email, account.password);
    for (const [field, section] of [["bio", "basic"], ["location", "location"], ["publicLinks", "social"], ["verification", "verificacion"]]) {
      await gotoOK(page, "/dashboard/profesional?tab=completion");
      const step = page.locator(`[data-completion-step="${field}"]`);
      await expect(step).toBeVisible();
      await page.evaluate((section) => {
        const state = { stopped: false, frames: [] as boolean[] };
        (window as unknown as { __navigationPaint: typeof state }).__navigationPaint = state;
        const sample = () => {
          if (state.stopped) return;
          if (new URLSearchParams(location.search).get("tab") === "profile") {
            const target = document.querySelector(`#sec-${section} > button`);
            state.frames.push(target?.getAttribute("aria-expanded") === "true");
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }, section);
      await step.click();
      await expect(page.locator(`#sec-${section} > button`)).toHaveAttribute("aria-expanded", "true");
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const frames = await page.evaluate(() => {
        const state = (window as unknown as { __navigationPaint: { stopped: boolean; frames: boolean[] } }).__navigationPaint;
        state.stopped = true; return state.frames;
      });
      expect(frames.length).toBeGreaterThan(0);
      expect(frames.every(Boolean), `No intermediate profile menu for ${field}`).toBe(true);
      await expectNoHorizontalOverflow(page);
    }
    for (const field of ["servicePrice", "serviceDescription", "serviceExperience"]) {
      await gotoOK(page, "/dashboard/profesional?tab=completion");
      await page.evaluate(() => {
        const state = { stopped: false, frames: [] as boolean[] };
        (window as unknown as { __servicePaint: typeof state }).__servicePaint = state;
        const sample = () => {
          if (state.stopped) return;
          if (new URLSearchParams(location.search).get("tab") === "services") state.frames.push(!!document.querySelector('[data-testid="service-edit-save"]'));
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await page.locator(`[data-completion-step="${field}"]`).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByTestId("service-edit-save")).toBeVisible();
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const frames = await page.evaluate(() => {
        const state = (window as unknown as { __servicePaint: { stopped: boolean; frames: boolean[] } }).__servicePaint;
        state.stopped = true; return state.frames;
      });
      expect(frames.length).toBeGreaterThan(0);
      expect(frames.every(Boolean), `No intermediate service list for ${field}`).toBe(true);
      await expectNoHorizontalOverflow(page);
    }
  } finally { await cleanupDisposableAccount(account); }
});

test("cached panel lists stay visible during slow background revalidation", async ({ page, context }) => {
  test.skip(!isolated, "Isolated test database required");
  test.setTimeout(180_000);
  let account: DisposableAccount | undefined;
  try {
    await nativeShell(page, context);
    account = await createDisposableAccount({ prefix: "warm-panel", professional: true });
    await loginAs(page, account.email, account.password);
    await gotoOK(page, "/dashboard/profesional?tab=soporte");
    const panel = page.locator("[data-dashboard-current]");
    const tabs = ["soporte", "notifications", "saved", "connections", "sent_projects", "jobs", "offers", "quotes"];
    const go = async (tab: string) => {
      await page.evaluate((tab) => { history.pushState(null, "", `${location.pathname}?tab=${tab}`); }, tab);
      await expect(panel).toHaveAttribute("data-dashboard-current", tab);
    };
    for (const tab of tabs) {
      await go(tab);
      await expect(panel.locator("[data-panel-loading], .ccr-skeleton-shimmer").filter({ visible: true })).toHaveCount(0, { timeout: 30_000 });
      await page.waitForTimeout(600);
    }
    await page.route("**/api/**", async (route) => {
      if (route.request().method() === "GET") await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    for (const tab of tabs) {
      await go(tab);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(await panel.locator("[data-panel-loading], .ccr-skeleton-shimmer").filter({ visible: true }).count(), `${tab} uses its cached content`).toBe(0);
    }
  } finally { await cleanupDisposableAccount(account); }
});

test("messages reuse their warmed inbox when reopening the native route", async ({ page, context }) => {
  test.skip(!isolated || (page.viewportSize()?.width ?? 0) >= 1024, "Native phone viewport and isolated test required");
  let account: DisposableAccount | undefined;
  try {
    await nativeShell(page, context);
    account = await createDisposableAccount({ prefix: "warm-inbox" });
    await loginAs(page, account.email, account.password);
    await gotoOK(page, "/mensajes");
    const inbox = page.locator("[data-messages-page-shell]");
    await expect(inbox).toBeVisible();
    await expect(inbox.locator("[aria-busy=true]")).toHaveCount(0);
    await page.waitForTimeout(700);
    await page.route("**/api/direct-chat*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800)); await route.continue();
    });
    for (let i = 0; i < 5; i++) {
      await page.locator('a[href^="/dashboard/profesional"]').filter({ visible: true }).last().click();
      await expect(page).toHaveURL(/dashboard\/profesional/);
      await page.locator('a[href="/mensajes"]').filter({ visible: true }).last().click();
      await expect(inbox).toBeVisible();
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(await inbox.locator("[aria-busy=true]").count()).toBe(0);
    }
  } finally { await cleanupDisposableAccount(account); }
});
