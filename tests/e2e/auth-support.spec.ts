import { expect, test } from "playwright/test";
import { expectNoHorizontalOverflow, gotoOK } from "./helpers";

test.describe("@smoke auth and support", () => {
  test("login page exposes password and OAuth entry points without submitting", async ({ page }) => {
    await gotoOK(page, "/es/login");

    await expect(page.getByRole("heading", { name: /Bienvenido de vuelta/i })).toBeVisible();
    await expect(page.getByLabel(/Correo/i).first()).toBeVisible();
    await expect(page.getByLabel(/Contras/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Ingresar/i }).last()).toBeVisible();
    await expect(page.getByRole("button", { name: /Continuar con Google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continuar con Facebook/i })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("support form opens the reason dropdown and keeps required fields visible", async ({ page }) => {
    await gotoOK(page, "/es/soporte");

    await expect(page.getByRole("textbox", { name: /Tu nombre/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /tucorreo/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Describe tu consulta/i })).toBeVisible();

    await expect(page.getByRole("button", { name: /Selecciona el motivo/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
