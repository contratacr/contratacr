import { test, expect, type Page } from "playwright/test";
import { gotoOK, isMobileProject, loginAs } from "./helpers";

// UN SOLO PANEL. El botón para cambiar entre panel cliente y profesional se
// retiró, pero el modo seguía vivo por dentro: un enlace con ?mode=use metía a
// la cuenta profesional en el panel de cliente (nombre personal, cuatro
// opciones), se guardaba en la pestaña y no había cómo volver.
const opcionesDelMenu = (page: Page) =>
  page.locator("aside a, aside button").filter({ visible: true }).count();

test("la cuenta profesional ve su panel aunque el enlace pida el de cliente", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "El menú lateral es de computadora; en el teléfono el panel es una lista.");
  await loginAs(page, "e2e.pro@contratacr.test", process.env.E2E_TEST_PASSWORD ?? "");
  await gotoOK(page, "/es/dashboard/profesional?tab=sent_projects");
  await expect(page.locator("aside").first()).toBeVisible();
  const completo = await opcionesDelMenu(page);
  expect(completo).toBeGreaterThan(5);

  for (const viejo of ["/es/dashboard/profesional?tab=sent_projects&mode=use", "/es/dashboard/profesional?tab=saved&mode=use", "/es/dashboard/cliente?tab=projects"]) {
    await gotoOK(page, viejo);
    await expect(page.locator("aside").first()).toBeVisible();
    await expect.poll(() => opcionesDelMenu(page), { message: viejo }).toBe(completo);
  }
});

test("«Mis proyectos» del tablero de Proyectos no pide el panel de cliente", async ({ page }) => {
  await loginAs(page, "e2e.pro@contratacr.test", process.env.E2E_TEST_PASSWORD ?? "");
  await gotoOK(page, "/es/proyectos");
  const enlace = page.getByRole("link", { name: /Mis proyectos/i }).filter({ visible: true }).first();
  await expect(enlace).toBeVisible();
  expect(await enlace.getAttribute("href")).not.toContain("mode=use");
});

// Sin sesión, a la derecha de la barra va la cuenta —no la campana, que promete
// avisos que un visitante no tiene, ni un hueco—, y devuelve a donde se estaba.
test("sin sesión la barra del teléfono lleva a iniciar sesión y vuelve a la misma página", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), "En computadora la barra ya trae Iniciar sesión y Registrarse.");
  for (const ruta of ["/es", "/es/empleos", "/es/proyectos", "/es/ayuda"]) {
    await gotoOK(page, ruta);
    await expect(page.locator("[data-acceso-cabecera]").filter({ visible: true }), ruta).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Notificaciones" }).filter({ visible: true }), ruta).toHaveCount(0);
  }
  await gotoOK(page, "/es/buscar?categoria=plomeria");
  const cuenta = page.locator("[data-acceso-cabecera]").filter({ visible: true });
  await expect(cuenta).toHaveAttribute("href", /redirect=.*buscar.*categoria.*plomeria/);
  await gotoOK(page, "/es/login");
  await expect(page.locator("[data-acceso-cabecera]").filter({ visible: true })).toHaveCount(0);
});
