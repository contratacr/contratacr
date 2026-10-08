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
    // Sugerir no es elegir: el campo sigue vacío hasta el toque. Se mira el
    // servicio ELEGIDO en el campo, no «Se le avisará a N…»: esa línea solo
    // sale si hay profesionales de ese servicio, y en la base de CI puede no
    // haber ninguno (falló así cada madrugada desde el 7-oct).
    const elegido = page.locator("[data-servicio-elegido]").filter({ visible: true });
    await expect(elegido).toHaveCount(0);
    await sugerencia.getByRole("button", { name: "Usar" }).click();
    await expect(sugerencia).toHaveCount(0);
    await expect(elegido).toHaveText("Electricidad", { timeout: 15_000 });
    // Elegir con «Usar» no abre el selector de servicios (en Safari del iPhone
    // el toque pasaba al primer botón de la <label> que envolvía el campo).
    const selector = page.getByPlaceholder(/Buscar servicio/);
    await page.waitForTimeout(500);
    await expect(selector).toBeHidden();

    // El caso del 6-oct: con un servicio ya elegido, si el puesto dice otra cosa,
    // se avisa y se ofrece cambiarlo (sin cambiarlo solo).
    await puesto.fill("Plomero con experiencia");
    await expect(sugerencia).toContainText("Por el puesto, parece de Plomería.");
    await expect(elegido).toHaveText("Electricidad");
    await sugerencia.getByRole("button", { name: "Cambiar" }).click();
    await expect(elegido).toHaveText("Plomería", { timeout: 15_000 });
    await page.waitForTimeout(500);
    await expect(selector).toBeHidden();

    // Quitar el servicio con la X lo deja vacío, sin abrir el selector.
    await page.getByRole("button", { name: "Quitar servicio" }).filter({ visible: true }).first().click();
    await page.waitForTimeout(500);
    await expect(selector).toBeHidden();
    await expect(elegido).toHaveCount(0);
  });

  test("el autocompletado gris del puesto calza exacto con lo que se escribe", async ({ page }) => {
    test.skip(!canRunSeededRegression(), "Needs the seeded regression environment.");
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await gotoOK(page, "/empleos/publicar");
    await waitForInteractivePage(page);
    const puesto = page.locator('input[name="title"]');
    await puesto.fill("Asistente admi");
    const capa = page.locator("[data-autocompletado-puesto]");
    await expect(capa).toBeVisible();
    // En el teléfono los campos suben a 16 px; la capa tiene que crecer igual y
    // arrancar en el mismo punto, o la sugerencia pisa lo escrito.
    const medidas = await page.evaluate(() => {
      const campo = document.querySelector('input[name="title"]') as HTMLInputElement;
      const capa = document.querySelector("[data-autocompletado-puesto]") as HTMLElement;
      const espejo = capa.querySelector("span") as HTMLElement;
      const c = getComputedStyle(campo);
      const k = getComputedStyle(capa);
      const lienzo = document.createElement("canvas").getContext("2d")!;
      lienzo.font = `${c.fontWeight} ${c.fontSize} ${c.fontFamily}`;
      return {
        letraCampo: c.fontSize, letraCapa: k.fontSize, familiaIgual: c.fontFamily === k.fontFamily,
        inicioCampo: campo.getBoundingClientRect().left + parseFloat(c.paddingLeft) + parseFloat(c.borderLeftWidth),
        inicioCapa: espejo.getBoundingClientRect().left,
        anchoEscrito: lienzo.measureText(campo.value).width,
        anchoEspejo: espejo.getBoundingClientRect().width,
      };
    });
    expect(medidas.letraCapa).toBe(medidas.letraCampo);
    expect(medidas.familiaIgual).toBe(true);
    expect(Math.abs(medidas.inicioCapa - medidas.inicioCampo)).toBeLessThan(1.5);
    expect(Math.abs(medidas.anchoEspejo - medidas.anchoEscrito)).toBeLessThan(1.5);
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
    const selector = page.getByPlaceholder(/Buscar servicio/);
    await page.waitForTimeout(500);
    await expect(selector).toBeHidden();
    await page.getByRole("button", { name: "Quitar servicio" }).filter({ visible: true }).first().click();
    await page.waitForTimeout(500);
    await expect(selector).toBeHidden();
  });
});
