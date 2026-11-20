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
    await completeAdminMfa(page, account.email, false);
    await expect(security.getByText("Activada", { exact: true })).toBeVisible();
    // Checking the old password must preserve the live second-factor session.
    const nextPassword = `${account.password}2`;
    await page.getByRole("button",{name:"Cambiar contraseña",exact:true}).click();
    await page.getByPlaceholder("Contraseña actual",{exact:true}).fill(account.password);
    await page.getByPlaceholder("Nueva contraseña (mínimo 8 caracteres)",{exact:true}).fill(nextPassword);
    await page.getByPlaceholder("Repite la nueva contraseña",{exact:true}).fill(nextPassword);
    await page.getByRole("button",{name:"Guardar contraseña",exact:true}).click();
    await expect(page.locator("[data-account-security]")).toContainText("Tu contraseña fue actualizada.");
    account.password = nextPassword;
    await expect(page.locator("main[data-admin-mfa]")).toHaveCount(0);
    expect(await (await page.request.get("/api/auth/session-mfa")).json()).toMatchObject({enrolled:true,required:false});
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
    await completeAdminMfa(page, account.email, false);
    expect((await page.request.get("/api/direct-chat")).status()).toBe(200);
    await gotoOK(page, "/dashboard/profesional?tab=cuenta");
    await expect(security.getByText("Activada", { exact: true })).toBeVisible();
    await security.getByRole("button", { name: "Desactivar", exact: true }).click();
    await completeAdminMfa(page, account.email, false);
    await expect(security.getByText("Desactivada", { exact: true })).toBeVisible();
    await resetAuth(page);
    await loginAs(page, account.email, account.password, { adminMfa: false });
    await expect(page.locator("[data-admin-mfa]")).toHaveCount(0);
    expect((await page.request.get("/api/direct-chat")).status()).toBe(200);
  } finally { if (account) await cleanupDisposableAccount(account); }
});
