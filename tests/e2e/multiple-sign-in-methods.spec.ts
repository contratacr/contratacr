import { createClient } from "@supabase/supabase-js";
import { test, expect } from "playwright/test";
import { gotoOK, loginAs, resetAuth } from "./helpers";
import { canRunSeededRegression } from "./seed";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";

test("Apple and Google remain available and last-used is only a device hint", async ({ page, context }) => {
  await resetAuth(page);
  await gotoOK(page, "/login");
  await expect(page.getByRole("button", { name: "Continuar con Apple", exact: true })).toBeVisible();
  await expect(page.getByText("Usaste la última vez:")).toHaveCount(0);
  const url = new URL(page.url());
  await context.addCookies([{ name: "ccr_last_sign_in", value: "apple", domain: url.hostname, path: "/" }]);
  await page.reload();
  await expect(page.getByText("Usaste la última vez: Apple", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar con Apple", exact: true })).toBeEnabled();
});

test.describe("authenticated account can keep password and social access", () => {
  test.skip(!canRunSeededRegression(), "Requires the isolated test database.");
  let account: DisposableAccount | undefined;
  test.beforeEach(async () => { account = await createDisposableAccount({ prefix: "multi-method" }); });
  test.afterEach(async () => { await cleanupDisposableAccount(account); });

  test("authenticated users can initiate linking Google to their existing account", async () => {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const signedIn = await client.auth.signInWithPassword({ email: account!.email, password: account!.password });
    expect(signedIn.error).toBeNull();
    const originalId = signedIn.data.user!.id;
    const linked = await client.auth.linkIdentity({ provider: "google", options: { skipBrowserRedirect: true, redirectTo: "https://test.contratacr.com/auth/callback?flow=link" } });
    expect(linked.error).toBeNull();
    expect(new URL(linked.data!.url!).hostname).toBe("accounts.google.com");
    expect((await client.auth.getUser()).data.user!.id).toBe(originalId);
    await client.auth.signOut();
  });

  test("callback does not reject an authenticated password account and saves last method", async ({ page, context }) => {
    await loginAs(page, account!.email, account!.password);
    await gotoOK(page, "/auth/callback?flow=native&provider=google&locale=es");
    await expect(page).not.toHaveURL(/autherror=use_password/);
    await expect(page).toHaveURL(/\/dashboard\//);
    const cookies = await context.cookies();
    expect(cookies.find((cookie) => cookie.name === "ccr_last_sign_in")?.value).toBe("google");
  });
});

test("an OAuth code arriving on home is not password recovery", async ({ page }) => {
  await gotoOK(page, "/?code=invalid-oauth-regression");
  await expect(page).toHaveURL(/auth=error/);
  await expect(page.getByRole("heading", { name: "Nueva contraseña" })).toHaveCount(0);
});


test("expired OAuth returns to login with an actionable message", async ({ page }) => {
  await gotoOK(page, "/?error=invalid_request&error_code=bad_oauth_state");
  await expect(page).toHaveURL(/login\?autherror=oauth_expired/);
  await expect(page.getByText(/Este intento de acceso venció/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar con Apple", exact: true })).toBeEnabled();
});
