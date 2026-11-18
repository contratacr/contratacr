import { expect, test } from "playwright/test";
import { gotoOK, openLoginForm } from "./helpers";

// "VERIFICA TU CORREO" EN EL TELÉFONO (18-nov-2026): la tarjeta del código se
// centraba en todo el alto de la pantalla y quedaba a media pantalla, con un
// hueco arriba y scroll. Va justo bajo el encabezado y la página no se desliza.
test("el codigo de verificacion queda bajo el encabezado y sin scroll en el telefono", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Cuenta sin confirmar: el inicio de sesión responde email_not_confirmed y la
  // pantalla pasa al código. Nada sale a Supabase.
  await page.route("**/auth/v1/token**", (route) => route.fulfill({
    status: 400,
    contentType: "application/json",
    body: JSON.stringify({ code: "email_not_confirmed", error_code: "email_not_confirmed", msg: "Email not confirmed" }),
  }));
  await page.route("**/auth/v1/resend**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

  await gotoOK(page, "/login");
  await openLoginForm(page);
  await page.getByLabel(/Correo/i).first().fill("sin-confirmar@example.com");
  await page.getByLabel(/Contras/i).first().fill("Clave-de-prueba-1");
  await page.getByRole("button", { name: /Ingresar/i }).last().click();

  const titulo = page.getByRole("heading", { name: "Verifica tu correo" });
  await expect(titulo).toBeVisible();
  const tarjeta = page.locator(".ccr-paso-codigo main > div").first();
  const encabezado = await page.locator(".ccr-paso-codigo header, .ccr-paso-codigo nav").first().boundingBox();
  const caja = await tarjeta.boundingBox();
  expect(caja!.y - (encabezado!.y + encabezado!.height)).toBeLessThanOrEqual(32);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
});
