import { expect, test } from "playwright/test";
import { isMobileProject, loginAs } from "./helpers";

// Un proyecto se corrige, como un empleo y como una promoción. Antes no se
// podía en ninguna parte: un dato mal escrito obligaba a cancelar y volver a
// publicar, perdiendo la fecha y a quien ya lo estaba mirando.
test("@seeded el cliente corrige su proyecto y el cambio queda", async ({ page }) => {
  test.skip(isMobileProject(test.info()), "La tarjeta de acciones del dueño es de computadora.");
  await page.setViewportSize({ width: 1366, height: 900 });
  await loginAs(page, "cliente.pruebas@contratacr.test", "ClientePruebas2026!");
  await page.goto("/es/proyectos");
  const enlaces = await page.locator('a[href*="/proyectos/"]').evaluateAll((ns) => ns.map((n) => (n as HTMLAnchorElement).getAttribute("href")));
  const ficha = enlaces.find((h) => h && /[0-9a-f-]{20,}/.test(h));
  expect(ficha, "el tablero sembrado trae al menos un proyecto").toBeTruthy();
  await page.goto(ficha!);

  // Dos acciones del dueño, con los rótulos cortos de Empleos y Promociones.
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Administrar", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const caja = page.locator('[role=dialog] textarea');
  await expect(caja).toBeVisible();
  // Lo escrito viene puesto, y el número no se vuelve a preguntar: ya es suyo.
  await expect(caja).not.toHaveValue("");
  await expect(page.locator('[role=dialog] input[type=tel]')).toHaveCount(0);

  const marca = `corregido ${Date.now()}`;
  await caja.fill(`Dos cámaras en la entrada del garaje. ${marca}`);
  await page.getByRole("button", { name: /Guardar cambios/ }).click();
  await expect(page.locator("article").first()).toContainText(marca, { timeout: 15000 });

  // Y sigue estando después de recargar: se guardó, no se pintó.
  await page.reload();
  await expect(page.locator("article").first()).toContainText(marca);
});
