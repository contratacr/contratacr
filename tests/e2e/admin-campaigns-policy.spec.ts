import { completeAdminMfa } from "./admin-mfa-helper";
import { expect, test } from "playwright/test";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";
import { gotoOK, resetAuth, waitForInteractivePage } from "./helpers";

const hasTestDatabase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes("oqheayqqprpciqdvdaqo") && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe("admin campaign policy", () => {
  test.skip(!hasTestDatabase, "Requires the isolated regression database.");
  let account: DisposableAccount;
  test.beforeAll(async () => { account = await createDisposableAccount({ prefix: "campaign-policy", admin: true }); });
  test.afterAll(async () => { if (account) await cleanupDisposableAccount(account); });
  test.beforeEach(async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/admin");
    await waitForInteractivePage(page);
    await page.getByPlaceholder(/Correo de administrador/i).fill(account.email);
    await page.getByPlaceholder(/Contrase.a/i).fill(account.password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByPlaceholder(/Correo de administrador/i)).toBeHidden({ timeout: 20_000 });
  await completeAdminMfa(page, account.email);
  });

  test("retired email campaigns are rejected by the API before any sending", async ({ page }) => {
    for (const audience of ["todas", "pros_sin_precio"]) {
      const get = await page.request.get(`/api/admin/campanas?audiencia=${audience}`);
      expect(get.status()).toBe(410);
      const post = await page.request.post("/api/admin/campanas", { data: {
        audiencia: audience, campaignId: audience === "pros_sin_precio" ? "precio" : "recordatorio",
        mode: "all", confirm: "ENVIAR", subject: "Retired", body: "Retired",
      } });
      expect(post.status()).toBe(410);
    }
  });

  test("the panel shows permanent-history exclusions and only the first-review email template", async ({ page }) => {
    await page.route("**/api/admin/campanas?**", (route) => route.fulfill({ json: {
      clients: 442, adminEmail: account.email, porTanda: 60, enviados: 404, restantes: 12,
      horasParaLaProxima: 0, abiertos: 43, clics: 5, rebotes: 4, midiendo: true, sinConfirmar: 1,
    } }));
    await page.route("**/api/admin/correo", (route) => route.fulfill({ json: { enviados: 10, tope: 300, restantes: 290, margenPorNivel: { masivo: 240 } } }));
    await page.route("**/api/admin/invitar-resena", (route) => route.fulfill({ json: { cuentas: 442, yaTienen: 429, restantes: 0, historialSinConfirmar: 13 } }));
    await gotoOK(page, "/admin/campanas");
    await expect(page.getByRole("button", { name: "Pedir primeras reseñas", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Servicios disponibles en ContrataCR", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Profesionales sin precio", exact: true })).toHaveCount(0);
    await expect(page.getByText("13 cuentas anteriores tienen historial sin confirmar.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sin invitaciones pendientes", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Enviar a 12 (quedan 12)", exact: true })).toBeEnabled();
    await expect(page.getByText(/1 envíos pendientes de confirmación/)).toBeVisible();
    await expect(page.locator("body")).not.toContainText("263 profesionales");
    await expect(page.getByRole("textbox", { name: "Ruta del botón" })).toHaveValue("/dashboard/profesional?mode=offer&share=reviews");
    await expect(page.locator("body")).not.toContainText("quedan 100 libres");
  });

  test("unknown invitation history disables sending instead of displaying zero pending", async ({ page }) => {
    await page.route("**/api/admin/campanas?**", (route) => route.fulfill({ json: { clients: 442, restantes: 0 } }));
    await page.route("**/api/admin/invitar-resena", (route) => route.fulfill({ status: 503, json: { error: "No se pudo comprobar el historial." } }));
    await gotoOK(page, "/admin/campanas");
    await expect(page.getByRole("alert").filter({ hasText: "No se pudo comprobar el historial." })).toBeVisible();
    await expect(page.getByRole("button", { name: /Pedir reseña a/ })).toBeDisabled();
  });
});
