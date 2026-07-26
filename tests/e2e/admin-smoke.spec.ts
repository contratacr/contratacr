import { expect, test } from "playwright/test";
import { expectHealthyPage, expectVisibleText, gotoOK, resetAuth, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed } from "./seed";

const adminRoutes = [
  { path: "/es/admin", marker: /Resumen|Panel de administracion|Panel de administraci.n/i },
  { path: "/es/admin/verificacion", marker: /Verificacion|Verificaci.n/i },
  { path: "/es/admin/usuarios", marker: /Usuarios/i },
  { path: "/es/admin/reportes", marker: /Reportes/i },
  { path: "/es/admin/aseguradoras", marker: /Aseguradoras/i },
  { path: "/es/admin/servicios", marker: /Servicios/i },
  { path: "/es/admin/solicitudes", marker: /Solicitudes/i },
  { path: "/es/admin/publicaciones", marker: /Proyectos/i },
  { path: "/es/admin/cuentas", marker: /Cuentas/i },
  { path: "/es/admin/soporte", marker: /Soporte/i },
  { path: "/es/admin/analitica", marker: /Analitica|Anal.tica/i },
  { path: "/es/admin/actividad", marker: /Actividad/i },
] as const;

test.describe("@admin surfaces", () => {
  test.beforeAll(async () => {
    if (canRunSeededRegression()) await ensureRegressionSeed();
  });

  test("admin entry shows the restricted login when signed out", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/es/admin");
    await expect(page.getByText(/Panel de administracion|Panel de administraci.n/i).first()).toBeVisible();
    await expect(page.getByPlaceholder(/Correo de administrador/i)).toBeVisible();
    await expect(page.getByPlaceholder(/Contrase.a|Contrasena/i)).toBeVisible();
    await expectHealthyPage(page);
  });

  test("admin APIs reject unauthenticated access", async ({ request }) => {
    const routes = [
      "/api/admin/projects",
      "/api/admin/bookings",
      "/api/admin/users",
      "/api/admin/providers",
      "/api/admin/reports",
      "/api/admin/support",
      "/api/admin/accounts",
      "/api/admin/insurers",
      "/api/admin/pending-counts",
    ];

    for (const route of routes) {
      const response = await request.get(route);
      expect([401, 403], `${route} must reject unauthenticated access`).toContain(response.status());
    }
  });

  test("admin panel sections render when admin credentials are configured", async ({ page }) => {
    const seeded = canRunSeededRegression();
    const email = seeded ? E2E_USERS.admin.email : (process.env.E2E_ADMIN_EMAIL || "");
    const password = seeded ? E2E_USERS.admin.password : (process.env.E2E_ADMIN_PASSWORD || "");
    test.skip(!email || !password, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run authenticated admin regression.");

    await resetAuth(page);
    await gotoOK(page, "/es/admin");
    await waitForInteractivePage(page);
    await page.getByPlaceholder(/Correo de administrador/i).fill(email!);
    await page.getByPlaceholder(/Contrase.a|Contrasena/i).fill(password!);
    await page.getByRole("button", { name: /Ingresar/i }).click();
    await expect(page.getByPlaceholder(/Correo de administrador/i)).toBeHidden({ timeout: 20_000 });
    await expectVisibleText(page.locator("body"), adminRoutes[0].marker);

    for (const route of adminRoutes) {
      await gotoOK(page, route.path);
      await expectVisibleText(page.locator("body"), route.marker);
      await expectHealthyPage(page);
    }
  });
});
