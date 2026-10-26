import { test, expect } from "playwright/test";
import { hasAdminSessionMfa } from "../../src/lib/auth/admin-mfa-policy";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";
import { loginAs, gotoOK, resetAuth } from "./helpers";
import { completeAdminMfa, totp } from "./admin-mfa-helper";

const now = 100000;
test("admin MFA requires signed AAL2 and a session TOTP, not refresh/password/email", () => {
  const valid = { aal: "aal2", amr: [{ method: "totp", timestamp: now - 30 }] };
  expect(hasAdminSessionMfa(valid, now)).toBe(true);
  expect(hasAdminSessionMfa({ ...valid, amr: [{ method: "mfa/totp", timestamp: now - 899 }] }, now)).toBe(true);
  expect(hasAdminSessionMfa({ ...valid, amr: [{ method: "token_refresh", timestamp: now }, { method: "totp", timestamp: now - 3600 }] }, now)).toBe(true);
  for (const claims of [{}, { ...valid, aal: "aal1" }, { ...valid, amr: [{ method: "password", timestamp: now }] }, { ...valid, amr: [{ method: "otp", timestamp: now }] }, { ...valid, amr: [{ method: "totp", timestamp: now + 60 }] }, { ...valid, amr: [{ method: "totp", timestamp: "100000" }] }]) expect(hasAdminSessionMfa(claims, now)).toBe(false);
  // RFC 6238 SHA1 test vector, truncated to six digits.
  expect(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59000)).toBe("287082");
});

test("administrator panel and API require real MFA enrollment, including a new login", async ({ page, context, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  let account: DisposableAccount | undefined;
  try {
    account = await createDisposableAccount({ prefix: "admin-mfa", admin: true });
    if (testInfo.project.name.includes("mobile")) {
      await context.addCookies([{ name: "ccr_platform", value: "native", url: baseURL! }]);
      await page.addInitScript(() => localStorage.setItem("ccr:native-first-run-onboarding:v12", "1"));
    }
    await loginAs(page, account.email, account.password, { adminMfa: false });
    await expect(page.locator("[data-admin-mfa]")).toBeVisible();
    await gotoOK(page, "/admin");
    await expect(page.locator("[data-admin-mfa]")).toBeVisible();
    const screen = page.locator("[data-authentication-screen]");
    await expect(page.locator("html")).toHaveCSS("scrollbar-gutter", "auto");
    const bounds = await screen.boundingBox();
    expect(bounds!.x).toBe(0);
    expect(bounds!.y).toBe(0);
    // Read both widths in the same frame after the previous route releases its scrollbar.
    await expect.poll(() => screen.evaluate(element => Math.abs(element.getBoundingClientRect().width - document.documentElement.clientWidth))).toBeLessThan(1);
    await expect(screen).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await page.screenshot({ path: test.info().outputPath("admin-mfa-setup-screen.png") });
    if (testInfo.project.name.includes("mobile")) {
      // A cold native entry can retain the prepaint nav class before any tab
      // component mounts. It must not impose its minimum height on MFA.
      await page.evaluate(() => document.body.classList.add("ccr-native-bottom-nav-visible"));
      await expect(screen).toHaveCSS("min-height", "0px");
      const original = page.viewportSize()!;
      await page.setViewportSize({ width: 320, height: 420 });
      await expect.poll(async () => Math.round((await screen.boundingBox())!.height)).toBe(420);
      const configure = screen.getByRole("button", { name: "Configurar autenticador" });
      await configure.scrollIntoViewIfNeeded();
      await expect(configure).toBeInViewport();
      await page.setViewportSize(original);
      await expect.poll(async () => Math.round((await screen.boundingBox())!.height)).toBe(original.height);
    }
    for (const route of ["/api/admin/users", "/api/admin/pending-counts", "/api/admin/identificaciones"]) expect((await page.request.get(route)).status()).toBe(403);
    const status = await page.request.get("/api/auth/admin-mfa");
    expect(await status.json()).toMatchObject({ isAdmin: true, required: true, enrolled: false });
    // The native launch listener must remain mounted outside the MFA gate.
    // Otherwise its prepaint cover blocks the authenticator indefinitely.
    await expect(page.locator("#ccr-app-link-cover")).toBeHidden();
    await completeAdminMfa(page, account.email);
    expect((await page.request.get("/api/admin/pending-counts")).status()).toBe(200);
    await gotoOK(page, "/admin/usuarios");
    await expect(page.locator("[data-admin-mfa]")).toHaveCount(0);
    // A new password session does not inherit the previous AAL2 challenge.
    await resetAuth(page);
    await loginAs(page, account.email, account.password, { adminMfa: false });
    await expect(page.locator("[data-admin-mfa]")).toBeVisible();
    await gotoOK(page, "/admin");
    await expect(page.getByRole("textbox", { name: "Código de verificación" })).toBeVisible();
    expect((await page.request.get("/api/admin/pending-counts")).status()).toBe(403);
    await page.locator("[data-admin-mfa]").screenshot({ path: test.info().outputPath("admin-mfa-code-screen.png") });
    await completeAdminMfa(page, account.email);
    expect((await page.request.get("/api/admin/pending-counts")).status()).toBe(200);
  } finally { if (account) await cleanupDisposableAccount(account); }
});
