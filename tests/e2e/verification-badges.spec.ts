import { VERIFIED_SEAL_DATA_URL } from "../../src/lib/verified-seal";
import { test, expect } from "playwright/test";
import { gotoOK, waitForInteractivePage, expectNoHorizontalOverflow, loginAs } from "./helpers";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";
import { canRunSeededRegression, E2E_USERS, regressionAdminClient } from "./seed";

for (const path of ["/profesionales", "/promociones", "/empleos", "/proyectos"]) {
  test(`${path}: check explains identity without opening the card`, async ({ page }) => {
    await gotoOK(page, path);
    await waitForInteractivePage(page);
    const check = page.locator("[data-verification-badge]").filter({ visible: true }).first();
    await expect(check).toBeVisible();
    expect(await check.textContent()).toBe("");
    // The exported QR uses this SVG too: outline, check and stroke must match
    // the visible profile badge, not a separately drawn approximation.
    const sameSeal = await check.locator("svg").evaluate((svg, dataUrl) => {
      const exported = new DOMParser().parseFromString(decodeURIComponent(dataUrl.split(",")[1]), "image/svg+xml");
      const paths = (root: ParentNode) => Array.from(root.querySelectorAll("path"), (path) =>
        ["d", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"].map((key) => path.getAttribute(key)));
      return JSON.stringify(paths(svg)) === JSON.stringify(paths(exported));
    }, VERIFIED_SEAL_DATA_URL);
    expect(sameSeal, "QR exports and profile badges must share the same seal").toBe(true);
    expect(await check.evaluate((el) => el.closest("a"))).toBeNull();
    const before = page.url();
    await check.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Identidad verificada", { exact: true })).toBeVisible();
    await expect(dialog).toContainText("número, tipo y nombre con Hacienda o una revisión manual de documentos");
    await expect(dialog).toContainText("no demuestra quién usa la cuenta");
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
    await expect(owner.locator(".lucide-chevron-right")).toHaveCount(0);
    await expect(owner.locator("[data-cedula-verificada]")).toHaveCount(0);
    expect(await check.evaluate((el) => el.closest("a"))).toBeNull();
    const before = page.url();
    await check.click();
    await expect(page.getByRole("dialog")).toContainText("El check indica un cotejo");
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

test("the professional profile keeps only the interactive check beside its name", async ({ page }) => {
  await gotoOK(page, "/profesionales");
  const check = page.locator("[data-verification-badge]").filter({ visible: true }).first();
  await expect(check).toBeVisible();
  const card = check.locator("xpath=ancestor::article[1]");
  const href = await card.locator("h3 a").first().getAttribute("href");
  expect(href).toBeTruthy();
  await gotoOK(page, href!);
  const owner = page.locator("[data-verification-owner]").filter({ visible: true }).first();
  await expect(owner.locator("[data-verification-badge]")).toBeVisible();
  await expect(page.locator("[data-cedula-verificada]")).toHaveCount(0);
  await owner.locator("[data-verification-badge]").click();
  await expect(page.getByRole("dialog")).toContainText("no garantiza la calidad del trabajo");
});

test("registration explains the badge and opens the shared explanation", async ({ page }) => {
  await gotoOK(page, "/registro/profesional");
  const help = page.locator("[data-verification-education]");
  await expect(help.getByRole("button", { name: "Qué significa el check de identidad", exact: true })).toBeVisible();
  await expect(help).toContainText(/Cuando tu identidad esté verificada|Tu identidad está verificada/);
  await help.getByRole("button", { name: "Qué significa el check de identidad", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("El check indica un cotejo");
  await expect(page.getByRole("dialog")).toContainText("no garantiza la calidad del trabajo");
  await expectNoHorizontalOverflow(page);
});

test("dashboard name keeps only an interactive identity check", async ({ page }) => {
  test.skip(!canRunSeededRegression(), "Requires isolated regression accounts.");
  // A slower account-reactivation check leaves a real handoff window after
  // SIGNED_IN. Keep its actual response; only add normal mobile latency.
  await page.route("**/api/account/disable", async route => {
    if (route.request().postDataJSON()?.action === "reactivate") {
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    await route.continue();
  });
  const speculativePanels: string[] = [];
  page.on("request", request => {
    if (/\/login(?:[?#]|$)/.test(page.url()) && request.headers()["next-router-prefetch"] === "1" && new URL(request.url()).pathname.includes("/dashboard/")) {
      speculativePanels.push(new URL(request.url()).pathname);
    }
  });
  await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
  expect(speculativePanels, "Login must hand off its session without speculative panel navigation").toEqual([]);
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
  await expect(page.getByRole("dialog")).toContainText("Hacienda");
  await expect(page.locator("html")).toHaveClass(/ccr-native-app/);
  const close = page.getByRole("dialog").getByRole("button", { name: "Entendido", exact: true });
  expect(await close.evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
  await expectNoHorizontalOverflow(page);
  await page.getByRole("dialog").getByRole("button", { name: "Entendido", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});


test("verification shows only the identification check and its explanation", async ({ page }) => {
  test.skip(!(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes("oqheayqqprpciqdvdaqo") || !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Requires the isolated test database.");
  let account: DisposableAccount | undefined;
  try {
    account = await createDisposableAccount({ prefix: "verification-layout", professional: true });
    const db = regressionAdminClient();
    const profile = await db.from("profiles").update({ cedula: "700000001" }).eq("id", account.id);
    if (profile.error) throw profile.error;
    const pro = await db.from("professionals").update({ is_verified: true, verification_status: "verified" }).eq("id", account.professionalId!);
    if (pro.error) throw pro.error;
    await loginAs(page, account.email, account.password);
    await gotoOK(page, "/dashboard/profesional?tab=verificacion");
    const education = page.locator("[data-verification-education]").filter({ visible: true }).first();
    const identity = page.locator("[data-current-identification]").filter({ visible: true }).first();
    await expect(education).toHaveCount(0);
    await expect(identity).toContainText("700000001");

    await expect(identity.locator("[data-verification-badge]")).toHaveCount(1);
    for (const block of [identity]) {
      await block.locator("[data-verification-badge]").click();
      await expect(page.getByRole("dialog")).toContainText("número, tipo y nombre con Hacienda o una revisión manual de documentos");
      await page.getByRole("dialog").getByRole("button", { name: "Entendido", exact: true }).click();
    }
    const number = await identity.locator("p").filter({ hasText: /^700000001$/ }).boundingBox();
    const check = await identity.locator("[data-verification-badge]").boundingBox();
    expect(number).not.toBeNull(); expect(check).not.toBeNull();
    expect(check!.x - (number!.x + number!.width)).toBeLessThanOrEqual(8);
    await expectNoHorizontalOverflow(page);
    const unverified = await db.from("professionals").update({ is_verified: false, verification_status: "pending" }).eq("id", account.professionalId!);
    if (unverified.error) throw unverified.error;
    await gotoOK(page, "/dashboard/profesional?tab=verificacion");
    await expect(identity.locator("[data-verification-badge]")).toHaveCount(0);
    await expect(education).toHaveCount(0);
  } finally {
    await cleanupDisposableAccount(account);
  }
});
