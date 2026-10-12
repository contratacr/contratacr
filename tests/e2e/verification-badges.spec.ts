import { test, expect } from "playwright/test";
import { gotoOK, waitForInteractivePage, expectNoHorizontalOverflow, loginAs } from "./helpers";
import { canRunSeededRegression, E2E_USERS } from "./seed";

for (const path of ["/profesionales", "/promociones", "/empleos", "/proyectos"]) {
  test(`${path}: check explains identity without opening the card`, async ({ page }) => {
    await gotoOK(page, path);
    await waitForInteractivePage(page);
    const check = page.locator("[data-verification-badge]").filter({ visible: true }).first();
    await expect(check).toBeVisible();
    expect(await check.textContent()).toBe("");
    expect(await check.evaluate((el) => el.closest("a"))).toBeNull();
    const before = page.url();
    await check.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Identidad verificada", { exact: true })).toBeVisible();
    await expect(dialog).toContainText("registros oficiales o revisión de documentos");
    await expect(dialog).toContainText("no garantiza la calidad del trabajo");
    expect(page.url()).toBe(before);
    await expectNoHorizontalOverflow(page);
    await dialog.getByRole("button", { name: "Entendido", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await check.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(page.url()).toBe(before);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    if (path === "/profesionales" || (page.viewportSize()?.width ?? 0) < 1024) {
      const card = check.locator("xpath=ancestor::article[1]");
      await card.locator("h3 a, h2 a").first().click();
      await expect(page).not.toHaveURL(before);
    }
  });
}

for (const path of ["/promociones", "/empleos", "/proyectos"]) {
  test(`${path}: publication detail keeps the owner's check beside the name`, async ({ page }) => {
    await gotoOK(page, path);
    const cardCheck = page.locator("article [data-verification-badge]").filter({ visible: true }).first();
    await expect(cardCheck).toBeVisible();
    const href = await cardCheck.locator("xpath=ancestor::article[1]").locator("h3 a, h2 a").first().getAttribute("href");
    expect(href).toBeTruthy();
    await gotoOK(page, href!);
    const owner = page.locator("[data-verification-owner]").filter({ visible: true }).first();
    const check = owner.locator("[data-verification-badge]");
    await expect(check).toBeVisible();
    expect(await check.textContent()).toBe("");
    await expect(owner.locator("[data-cedula-verificada]")).toHaveCount(0);
    expect(await check.evaluate((el) => el.closest("a"))).toBeNull();
    const before = page.url();
    await check.click();
    await expect(page.getByRole("dialog")).toContainText("El check indica que ContrataCR comprobó");
    expect(page.url()).toBe(before);
    await expectNoHorizontalOverflow(page);
    await page.getByRole("dialog").getByRole("button", { name: "Entendido", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const aligned = await owner.evaluate((el) => {
      const badge = el.querySelector("[data-verification-badge]")!.getBoundingClientRect();
      const name = el.querySelector("a, p")!.getBoundingClientRect();
      return badge.left >= name.right - 1 && badge.top < name.bottom && badge.bottom > name.top;
    });
    expect(aligned).toBe(true);
  });
}

test("the professional profile keeps the written verification label", async ({ page }) => {
  await gotoOK(page, "/profesionales");
  const check = page.locator("[data-verification-badge]").filter({ visible: true }).first();
  await expect(check).toBeVisible();
  const card = check.locator("xpath=ancestor::article[1]");
  const href = await card.locator("h3 a").first().getAttribute("href");
  expect(href).toBeTruthy();
  await gotoOK(page, href!);
  await expect(page.locator("[data-cedula-verificada]").filter({ visible: true }).first()).toContainText("Verificado");
});

test("registration explains the badge and opens the shared explanation", async ({ page }) => {
  await gotoOK(page, "/registro/profesional");
  const help = page.locator("[data-verification-education]");
  await expect(help).toHaveText("Cuando tu identidad esté verificada, el check aparecerá junto a tu nombre en las tarjetas.");
  await help.getByRole("button", { name: "Qué significa el check de identidad", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("El check indica que ContrataCR comprobó");
  await expect(page.getByRole("dialog")).toContainText("no garantiza la calidad del trabajo");
  await expectNoHorizontalOverflow(page);
});

test("dashboard name keeps only an interactive identity check", async ({ page }) => {
  test.skip(!canRunSeededRegression(), "Requires isolated regression accounts.");
  await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
  await gotoOK(page, "/dashboard/profesional");
  const name = page.locator("h1").filter({ visible: true }).first();
  const check = name.locator("..").locator("[data-verification-badge]");
  await expect(check).toBeVisible();
  expect(await check.textContent()).toBe("");
  const gap = await check.evaluate((el) => {
    const icon = el.querySelector("svg")!.getBoundingClientRect();
    const name = el.closest("div")!.querySelector("h1")!.getBoundingClientRect();
    return icon.left - name.right;
  });
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(5);
  await expect(name.locator("..").locator("[data-cedula-verificada]")).toHaveCount(0);
  await check.click();
  await expect(page.getByRole("dialog")).toContainText("no garantiza la calidad del trabajo");
  await expectNoHorizontalOverflow(page);
});

test("the panel explains where verified identity is displayed", async ({ page }) => {
  test.skip(!canRunSeededRegression(), "Requires isolated regression accounts.");
  await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
  await gotoOK(page, "/dashboard/profesional?tab=verificacion");
  const help = page.locator("[data-verification-education]").filter({ visible: true }).first();
  await expect(help).toHaveText("Cuando tu identidad esté verificada, el check aparecerá junto a tu nombre en las tarjetas.");
  await help.getByRole("button", { name: "Qué significa el check de identidad", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("El check indica que ContrataCR comprobó");
});

test("the badge explanation is translated into English", async ({ page }) => {
  await gotoOK(page, "/en/profesionales");
  const check = page.getByRole("button", { name: "Identity verified: see what was checked", exact: true }).first();
  await expect(check).toBeVisible();
  await check.click();
  await expect(page.getByRole("dialog")).toContainText("does not guarantee work quality");
});

test("native phone shell keeps the explanation above its navigation", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.addCookies([{ name: "ccr_platform", value: "native", url: test.info().project.use.baseURL as string }]);
  await page.addInitScript(() => {
    localStorage.setItem("ccr:native-first-run-onboarding:v12", "1");
    const nativeRuntime: Record<string, unknown> = { isNativePlatform: () => true };
    Object.defineProperty(window, "Capacitor", {
      configurable: true,
      get: () => nativeRuntime,
      set: (value) => {
        if (value && typeof value === "object") Object.assign(nativeRuntime, value);
        nativeRuntime.isNativePlatform = () => true;
      },
    });
  });
  await gotoOK(page, "/profesionales");
  await waitForInteractivePage(page);
  await page.locator("[data-verification-badge]").filter({ visible: true }).first().click();
  await expect(page.getByRole("dialog")).toContainText("registros oficiales");
  await expect(page.locator("html")).toHaveClass(/ccr-native-app/);
  const close = page.getByRole("dialog").getByRole("button", { name: "Entendido", exact: true });
  expect(await close.evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
  await expectNoHorizontalOverflow(page);
  await page.getByRole("dialog").getByRole("button", { name: "Entendido", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
