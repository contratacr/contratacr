import { createClient } from "@supabase/supabase-js";
import { test, expect } from "playwright/test";
import { gotoOK, resetAuth, waitForInteractivePage, expectNoHorizontalOverflow } from "./helpers";
import { canRunSeededRegression, regressionAdminClient } from "./seed";
import { createDisposableAccount, cleanupDisposableAccount } from "./disposable-account";

const destination = "/dashboard/profesional?tab=cuenta&connect=apple";

for (const path of ["/login", "/registro/cliente", "/registro/profesional", "/en/login"]) {
  test(`Apple starts directly without an account notice on ${path}`, async ({ page }) => {
    let authorizations = 0;
    await page.route("**/auth/v1/authorize**", async route => {
      expect(new URL(route.request().url()).searchParams.get("provider")).toBe("apple");
      authorizations++;
      await route.fulfill({ status: 200, contentType: "text/html", body: "Apple authorization started" });
    });
    await resetAuth(page);
    await gotoOK(page, path);
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: path.startsWith("/en") ? "Continue with Apple" : "Continuar con Apple", exact: true }).click();
    await expect.poll(() => authorizations).toBe(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

test("existing email login keeps its profile and opens Apple linking", async ({ page }) => {
  test.skip(!canRunSeededRegression(), "Requires isolated regression data.");
  const account = await createDisposableAccount({ prefix: "apple-existing" });
  try {
    await resetAuth(page);
    await gotoOK(page, `/login?redirect=${encodeURIComponent(destination)}`);
    await waitForInteractivePage(page);
    await page.getByLabel("Correo electrónico", { exact: true }).fill(account.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).last().click();
    await expect(page).toHaveURL(/dashboard\/profesional\?tab=cuenta&connect=apple/);
    await expect(page.getByRole("heading", { name: "Métodos de acceso", exact: true })).toBeVisible();
    await expect(page.getByText(/Conecta Apple aquí para conservar este perfil/)).toBeVisible();
    const admin = regressionAdminClient();
    const { data: profiles, error } = await admin.from("profiles").select("id").eq("email", account.email);
    expect(error).toBeNull();
    expect(profiles).toEqual([{ id: account.id }]);
    if (process.env.LOCAL_REGRESSION_SEED !== "1") {
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      const signedIn = await client.auth.signInWithPassword({ email: account.email, password: account.password });
      expect(signedIn.error).toBeNull();
      const linked = await client.auth.linkIdentity({ provider: "apple", options: { skipBrowserRedirect: true, redirectTo: "https://test.contratacr.com/auth/callback?flow=link" } });
      expect(linked.error).toBeNull();
      expect(new URL(linked.data!.url!).hostname).toBe("appleid.apple.com");
      expect((await client.auth.getUser()).data.user!.id).toBe(account.id);
      await client.auth.signOut();
    }
  } finally { await cleanupDisposableAccount(account); }
});
