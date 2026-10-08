import { expect, test } from "playwright/test";
import { gotoOK, loginAs, resetAuth, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, E2E_USERS } from "./seed";

// Sugerir el servicio por lo que escribieron (7-oct-2026): una línea de un toque
// bajo el campo, solo con calce seguro, y nunca rellenado a escondidas. Nada de
// esto publica: no deja vacantes ni proyectos ni avisos en la base.

test.describe("sugerencia de servicio al publicar", () => {
  test("el puesto de la vacante sugiere su servicio y con un toque queda elegido", async ({ page }) => {
    test.skip(!canRunSeededRegression(), "Needs the seeded regression environment.");
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await gotoOK(page, "/empleos/publicar");
    await waitForInteractivePage(page);

    const puesto = page.locator('input[name="title"]');
    const sugerencia = page.locator("[data-sugerencia-servicio]");

    // Calce aproximado peligroso: «puerta» no es Ventanas y puertas. Sin sugerencia.
    await puesto.fill("Ejecutivo(a) de ventas puerta a puerta");
    await page.waitForTimeout(400);
    await expect(sugerencia).toHaveCount(0);

    // «Asistente administrativo» existe solo en el catálogo de producción (lo creó
    // el admin); aquí va un servicio del código, que está en todas las bases.
    await puesto.fill("Electricista residencial");
    await expect(sugerencia).toContainText("¿Es de Electricidad?");
    // Sugerir no es elegir: el campo sigue vacío hasta el toque.
    await expect(page.locator("[data-destinatarios-vacante]")).toHaveCount(0);
    await sugerencia.getByRole("button", { name: "Usar" }).click();
    await expect(sugerencia).toHaveCount(0);
    await expect(page.locator("[data-destinatarios-vacante]")).toContainText(/de Electricidad\./, { timeout: 15_000 });

    // El caso del 6-oct: con un servicio ya elegido, si el puesto dice otra cosa,
    // se avisa y se ofrece cambiarlo (sin cambiarlo solo).
    await puesto.fill("Plomero con experiencia");
    await expect(sugerencia).toContainText("Por el puesto, parece de Plomería.");
    await expect(page.locator("[data-destinatarios-vacante]")).toContainText(/de Electricidad\./);
    await sugerencia.getByRole("button", { name: "Cambiar" }).click();
    await expect(page.locator("[data-destinatarios-vacante]")).toContainText(/de Plomería\./, { timeout: 15_000 });
  });

  test("la descripción del proyecto sugiere el servicio y con un toque queda elegido", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/publicar-proyecto");
    await page.locator("#publish-project-title").waitFor({ timeout: 30_000 });
    await waitForInteractivePage(page);

    await page.getByPlaceholder(/Tengo una fuga/).fill("Necesito una app móvil para muestreos de campo");
    const sugerencia = page.locator("[data-sugerencia-servicio]");
    await expect(sugerencia).toContainText(/¿Es de .*app/i);
    await sugerencia.getByRole("button", { name: "Usar" }).click();
    await expect(sugerencia).toHaveCount(0);
    await expect(page.getByText(/profesional(?:es)? de este servicio recibir/)).toBeVisible({ timeout: 15_000 });
  });
});
