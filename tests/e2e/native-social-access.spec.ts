import { test, expect } from "playwright/test";
import { gotoOK } from "./helpers";
import { canRunSeededRegression, regressionAdminClient } from "./seed";
import { createDisposableAccount, cleanupDisposableAccount } from "./disposable-account";

// These exercise the real page and Capacitor JS adapter, with deterministic
// native responses. Live Google/Apple consent still requires a device account.
for (const platform of ["android", "ios"] as const) {
  test(`${platform}: native Google failure stays in the app and can be retried`, async ({ page, context }) => {
    let browserOAuth = 0;
    await page.route("**/auth/v1/authorize**", async route => { browserOAuth++; await route.abort(); });
    await context.addCookies([{ name: "ccr_platform", value: "native", url: String(test.info().project.use.baseURL || "http://localhost:3000") }, { name: "ccr_last_sign_in", value: "email", url: String(test.info().project.use.baseURL || "http://localhost:3000") }]);
    await page.addInitScript(({ platform }) => {
      localStorage.setItem("ccr:native-first-run-onboarding:v12", "1");
      const runtime = {
        PluginHeaders: [{ name: "SocialLogin", methods: ["initialize", "logout", "login"].map(name => ({ name, rtype: "promise" })) }],
        nativePromise: async (_plugin: string, method: string) => {
          if (method === "login") {
            document.documentElement.dataset.socialAttempts = String(Number(document.documentElement.dataset.socialAttempts || 0) + 1);
            throw new Error("No credentials available");
          }
          return {};
        },
      };
      if (platform === "android") Object.assign(window, { androidBridge: {} });
      else Object.assign(window, { webkit: { messageHandlers: { bridge: {} } } });
      Object.assign(window, { Capacitor: runtime });
    }, { platform });
    await gotoOK(page, "/login");
    await expect(page.getByText(/Usaste la última vez|Last used/)).toHaveCount(0);
    const google = page.getByRole("button", { name: "Continuar con Google", exact: true });
    for (let attempt = 1; attempt <= 2; attempt++) {
      await google.click();
      await expect(page.getByText("No pudimos iniciar sesión con Google en la app. Intenta de nuevo o usa tu correo.")).toBeVisible();
      await expect(google).toBeEnabled();
      await expect(page).toHaveURL(/\/login$/);
      if (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (platform === "android" || process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID)) {
        await expect(page.locator("html")).toHaveAttribute("data-social-attempts", String(attempt));
      }
    }
    expect(browserOAuth).toBe(0);
  });
}

test("new social clients complete their phone before onboarding finishes", async ({ page }) => {
  test.skip(!canRunSeededRegression(), "Requires isolated regression data.");
  const account = await createDisposableAccount({ prefix: "social-contact" });
  try {
    const admin = regressionAdminClient();
    const changed = await admin.auth.admin.updateUserById(account.id, { user_metadata: { onboarding_completed: false, role: null, intended_role: null } });
    expect(changed.error).toBeNull();
    const profile = await admin.from("profiles").update({ onboarding_completed: false }).eq("id", account.id);
    expect(profile.error).toBeNull();
    await gotoOK(page, "/login");
    await page.getByLabel("Correo electrónico", { exact: true }).fill(account.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByRole("button", { name: /Busco servicios/ }).click();
    await expect(page).toHaveURL(/\/registro\/cliente/);
    await expect(page.getByLabel(/Teléfono|Número de teléfono|WhatsApp/).first()).toBeVisible();
    const result = await admin.auth.admin.getUserById(account.id);
    expect(result.data.user?.user_metadata.onboarding_completed).toBe(false);
  } finally { await cleanupDisposableAccount(account); }
});

test("Android Apple callback hands PKCE back to the fixed app without a browser session", async ({ request }) => {
  const response = await request.get(`/auth/callback?flow=android-apple&native_state=${"a".repeat(64)}&code=regression-only-code&next=https://evil.example`, { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response.headers()["content-security-policy"]).toContain("default-src 'none'");
  const html = await response.text();
  expect(html).toContain("intent://contratacr.com/dashboard/native-auth-return?");
  expect(html).toContain("package=com.contratacr.app;end");
  expect(html).not.toContain("evil.example");
  expect(response.headers()["set-cookie"] ?? "").not.toMatch(/sb-[^;]*auth-token/);
});

test("Android Apple callback rejects an incomplete handoff", async ({ request }) => {
  const response = await request.get("/auth/callback?flow=android-apple&code=fixture&native_state=invalid", { maxRedirects: 0 });
  expect(response.status()).toBe(400);
});

test("Play build 14 explains the Apple update requirement without leaving the app", async ({ page }) => {
  let browserOAuth = 0;
  await page.route("**/auth/v1/authorize**", async route => { browserOAuth++; await route.abort(); });
  await page.addInitScript(() => {
    localStorage.setItem("ccr:native-first-run-onboarding:v12", "1");
    Object.assign(window, { androidBridge: {}, Capacitor: {
      PluginHeaders: [
        { name: "SocialLogin", methods: [{ name: "openSecureWindow", rtype: "promise" }] },
        // The old SocialLogin lacks Apple support; the Capacitor App bridge
        // still exposes launch URLs and listeners. Model both independently.
        { name: "App", methods: [
          { name: "getInfo", rtype: "promise" },
          { name: "getLaunchUrl", rtype: "promise" },
          { name: "addListener", rtype: "callback" },
          { name: "removeListener", rtype: "promise" },
        ] },
      ],
      nativePromise: async (plugin: string, method: string) => {
        if (plugin === "App" && method === "getInfo") return { build: "14", version: "1.0.10" };
        if (plugin === "App" && (method === "getLaunchUrl" || method === "removeListener")) return {};
        throw new Error("The obsolete build must not open a provider");
      },
      nativeCallback: (plugin: string, method: string) => {
        if (plugin === "App" && method === "addListener") return "legacy-app-listener";
        throw new Error("The obsolete build must not open a provider");
      },
    } });
  });
  await gotoOK(page, "/login");
  await expect(page.locator("#ccr-app-link-cover")).toBeHidden();
  await page.getByRole("button", { name: "Continuar con Apple", exact: true }).click();
  await expect(page.getByText("El acceso con Apple no está disponible en esta versión de la app. Puedes usarlo desde contratacr.com en tu navegador.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  expect(browserOAuth).toBe(0);
});
