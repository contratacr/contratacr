import { test, expect } from "playwright/test";
import { hasRecentAdminMfa } from "../../src/lib/auth/admin-mfa-policy";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";
import { loginAs, gotoOK, resetAuth } from "./helpers";
import { completeAdminMfa, totp } from "./admin-mfa-helper";

const now = 100000;
test("admin MFA requires signed AAL2 and a recent TOTP, not refresh/password/email", () => {
  const valid = { aal: "aal2", amr: [{ method: "totp", timestamp: now - 30 }] };
  expect(hasRecentAdminMfa(valid, now)).toBe(true);
  expect(hasRecentAdminMfa({ ...valid, amr: [{ method: "mfa/totp", timestamp: now - 899 }] }, now)).toBe(true);
  for (const claims of [{}, { ...valid, aal: "aal1" }, { ...valid, amr: [{ method: "password", timestamp: now }] }, { ...valid, amr: [{ method: "otp", timestamp: now }] }, { ...valid, amr: [{ method: "token_refresh", timestamp: now }, { method: "totp", timestamp: now - 900 }] }, { ...valid, amr: [{ method: "totp", timestamp: now + 60 }] }, { ...valid, amr: [{ method: "totp", timestamp: "100000" }] }]) expect(hasRecentAdminMfa(claims, now)).toBe(false);
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
    await expect(page.locator("[data-admin-mfa]")).toHaveCount(0);
    await gotoOK(page, "/admin");
    await expect(page.locator("[data-admin-mfa]")).toBeVisible();
    await page.locator("[data-admin-mfa]").screenshot({ path: test.info().outputPath("admin-mfa-setup-screen.png") });
    for (const route of ["/api/admin/users", "/api/admin/pending-counts", "/api/admin/identificaciones"]) expect((await page.request.get(route)).status()).toBe(403);
    const status = await page.request.get("/api/auth/admin-mfa");
    expect(await status.json()).toMatchObject({ isAdmin: true, required: true, enrolled: false });
    await completeAdminMfa(page, account.email);
    expect((await page.request.get("/api/admin/pending-counts")).status()).toBe(200);
    await gotoOK(page, "/admin/usuarios");
    await expect(page.locator("[data-admin-mfa]")).toHaveCount(0);
    // A new password session does not inherit the previous AAL2 challenge.
    await resetAuth(page);
    await loginAs(page, account.email, account.password, { adminMfa: false });
    await expect(page.locator("[data-admin-mfa]")).toHaveCount(0);
    await gotoOK(page, "/admin");
    await expect(page.getByRole("textbox", { name: "Código de verificación" })).toBeVisible();
    expect((await page.request.get("/api/admin/pending-counts")).status()).toBe(403);
    await page.locator("[data-admin-mfa]").screenshot({ path: test.info().outputPath("admin-mfa-code-screen.png") });
    await completeAdminMfa(page, account.email);
    expect((await page.request.get("/api/admin/pending-counts")).status()).toBe(200);
  } finally { if (account) await cleanupDisposableAccount(account); }
});
