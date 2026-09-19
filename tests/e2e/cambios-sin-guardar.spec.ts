import { test, expect } from "playwright/test";
import { gotoOK, isMobileProject, loginAs } from "./helpers";

// Encender un interruptor y volver a apagarlo no deja NADA por guardar. El
// botón se apaga otra vez y —lo que fallaba en el teléfono— la sección sigue
// abierta: el aviso de cambios sin guardar retiraba su entrada del historial y
// el panel leía ese «atrás» como si la persona hubiera querido volver.
test("encender y apagar un interruptor no saca de la sección ni deja cambios", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), "El paso interno con historial solo existe en el teléfono.");
  await loginAs(page, "e2e.pro@contratacr.test", process.env.E2E_TEST_PASSWORD ?? "");
  await gotoOK(page, "/es/dashboard/profesional?tab=profile");
  const seccion = page.locator("#sec-contact");
  await seccion.scrollIntoViewIfNeeded();
  const guardar = page.getByTestId("profile-save-contact");
  if (!(await guardar.isVisible().catch(() => false))) await seccion.locator("button").first().click();
  await expect(guardar).toBeVisible();
  await expect(guardar).toBeDisabled();

  const interruptor = seccion.getByRole("switch").first();
  const inicial = await interruptor.getAttribute("aria-checked");
  await interruptor.click();
  await expect(guardar).toBeEnabled();
  await interruptor.click();
  await expect(interruptor).toHaveAttribute("aria-checked", inicial ?? "false");
  // El retiro del centinela tarda un instante: se espera a que pase.
  await page.waitForTimeout(600);
  await expect(guardar).toBeVisible();
  await expect(guardar).toBeDisabled();
});
