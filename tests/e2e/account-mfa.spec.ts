import { test, expect } from "playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";
import { loginAs, gotoOK, resetAuth } from "./helpers";
import { completeAdminMfa } from "./admin-mfa-helper";
import { regressionAdminClient } from "./seed";

test("optional account MFA protects a new login, API and direct RPC until its second factor", async ({ page }) => {
  test.setTimeout(180_000);
  let account: DisposableAccount | undefined;
  try {
    regressionAdminClient();
    account = await createDisposableAccount({ prefix: "account-mfa" });
    await loginAs(page, account.email, account.password);
    await gotoOK(page, "/dashboard/profesional?tab=cuenta");
    const security = page.locator("[data-account-mfa]");
    await expect(security).toBeVisible();
    await expect(security.getByText("Desactivada", { exact: true })).toBeVisible();
    await security.getByRole("button", { name: "Activar", exact: true }).click();
    await completeAdminMfa(page, account.email);
    await expect(security.getByText("Activada", { exact: true })).toBeVisible();
    // A fresh password session must not bypass MFA through a SECURITY DEFINER RPC.
    const direct = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: loginError } = await direct.auth.signInWithPassword({ email: account.email, password: account.password });
    if (loginError) throw loginError;
    const privateRead = await direct.rpc("get_my_profile");
    expect(privateRead.error?.message).toContain("MFA_REQUIRED");
    await direct.auth.signOut({ scope: "local" });
    await resetAuth(page);
    await loginAs(page, account.email, account.password, { adminMfa: false });
    await expect(page.locator("[data-admin-mfa]")).toBeVisible();
    expect((await page.request.get("/api/direct-chat")).status()).toBe(403);
    await completeAdminMfa(page, account.email);
    expect((await page.request.get("/api/direct-chat")).status()).toBe(200);
    await gotoOK(page, "/dashboard/profesional?tab=cuenta");
    await expect(security.getByText("Activada", { exact: true })).toBeVisible();
    await security.getByRole("button", { name: "Desactivar", exact: true }).click();
    await completeAdminMfa(page, account.email);
    await expect(security.getByText("Desactivada", { exact: true })).toBeVisible();
    await resetAuth(page);
    await loginAs(page, account.email, account.password, { adminMfa: false });
    await expect(page.locator("[data-admin-mfa]")).toHaveCount(0);
    expect((await page.request.get("/api/direct-chat")).status()).toBe(200);
  } finally { if (account) await cleanupDisposableAccount(account); }
});
