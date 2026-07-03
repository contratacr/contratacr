import { expect, test } from "playwright/test";
import { expectHealthyPage, gotoOK, resetAuth } from "./helpers";

const adminRoutes = [
  { path: "/es/admin", marker: /Resumen|Panel de administracion|Panel de administraci.n/i },
  { path: "/es/admin/verificacion", marker: /Verificacion|Verificaci.n/i },
  { path: "/es/admin/usuarios", marker: /Usuarios/i },
  { path: "/es/admin/reportes", marker: /Reportes/i },
  { path: "/es/admin/aseguradoras", marker: /Aseguradoras/i },
  { path: "/es/admin/servicios", marker: /Servicios/i },
  { path: "/es/admin/cuentas", marker: /Cuentas/i },
  { path: "/es/admin/suscripciones", marker: /Suscripciones/i },
  { path: "/es/admin/soporte", marker: /Soporte/i },
  { path: "/es/admin/analitica", marker: /Analitica|Anal.tica/i },
  { path: "/es/admin/actividad", marker: /Actividad/i },
] as const;

test.describe("@admin surfaces", () => {
  test("admin entry shows the restricted login when signed out", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/es/admin");
    await expect(page.getByText(/Panel de administracion|Panel de administraci.n/i).first()).toBeVisible();
    await expect(page.getByPlaceholder(/Correo de administrador/i)).toBeVisible();
    await expect(page.getByPlaceholder(/Contrase.a|Contrasena/i)).toBeVisible();
    await expectHealthyPage(page);
  });

  test("admin panel sections render when admin credentials are configured", async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    test.skip(!email || !password, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run authenticated admin regression.");

    await resetAuth(page);
    await gotoOK(page, "/es/admin");
    await page.getByPlaceholder(/Correo de administrador/i).fill(email!);
    await page.getByPlaceholder(/Contrase.a|Contrasena/i).fill(password!);
    await page.getByRole("button", { name: /Ingresar/i }).click();
    await page.waitForURL(/\/es\/admin/, { timeout: 20_000 });
    await page.locator("body").waitFor({ state: "visible", timeout: 5_000 });

    for (const route of adminRoutes) {
      await gotoOK(page, route.path);
      await expect(page.locator("body").getByText(route.marker).first()).toBeVisible();
      await expectHealthyPage(page);
    }
  });
});
