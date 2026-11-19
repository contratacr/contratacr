import { expect, test, type Page } from "playwright/test";
import { loginAs, isMobileProject } from "./helpers";

/**
 * EL EDITOR DE CURRÍCULUM EN EL TELÉFONO (18-nov-2026).
 *  - Se vuelve a la lista con la flecha de la barra (y con el gesto de volver),
 *    no con un segundo «< Mis currículums» debajo de la barra.
 *  - En la lista, tocar la fila abre el documento y lo demás va en el «···».
 *  - «Más secciones» suma Proyectos, Referencias o una sección propia.
 *  - Editar / Diseño / Vista previa en pestañas; la hoja es la misma maqueta del PDF.
 *  - (19-nov-2026) Logros con negrita, más secciones y orden de las secciones.
 *    Los documentos se guardan en la cuenta: la prueba borra los que crea.
 */

const EMAIL = "e2e.pro@contratacr.test";
const PASSWORD = process.env.E2E_TEST_PASSWORD || "";

const flechaDeLaBarra = (page: Page) =>
  page.locator('[data-ccr-section-back], [data-native-back="dashboard-section"]').filter({ visible: true }).first();

async function abrirEditorNuevo(page: Page) {
  await page.goto("/dashboard/profesional?tab=cv");
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("ccr:cv-documentos")) localStorage.removeItem(k); });
  await page.reload();
  // Sin documentos, se abre uno nuevo directo.
  await expect(page.getByTestId("cv-builder")).toBeVisible({ timeout: 20_000 });
}

/** Lo que creó la prueba se borra: los documentos ahora se guardan en la cuenta. */
async function borrarLosDeLaPrueba(page: Page) {
  if (!(await page.getByTestId("cv-documentos").isVisible())) await flechaDeLaBarra(page).click();
  await expect(page.getByTestId("cv-documentos")).toBeVisible();
  for (let i = 0; i < 12 && (await page.getByTestId("cv-documento").count()); i++) {
    const fila = page.getByTestId("cv-documento").first();
    await fila.getByRole("button", { name: "Más opciones" }).click();
    await page.getByRole("menuitem", { name: "Eliminar" }).or(page.getByRole("button", { name: "Eliminar", exact: true })).first().click();
    await fila.getByRole("alert").getByRole("button", { name: "Eliminar" }).click();
  }
}

test.describe("editor de currículum", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo), "la flecha de la barra es del teléfono");
    await loginAs(page, EMAIL, PASSWORD);
  });

  test("la flecha y el gesto de volver regresan a la lista, sin un segundo botón", async ({ page }) => {
    await abrirEditorNuevo(page);
    await expect(page.getByTestId("cv-volver-lista")).toBeHidden();

    await flechaDeLaBarra(page).click();
    await expect(page.getByTestId("cv-documentos")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("tab")).toBe("cv");

    await page.getByTestId("cv-documento").first().getByRole("button").first().click();
    await expect(page.getByTestId("cv-builder")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("cv-documentos")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("tab")).toBe("cv");
    await borrarLosDeLaPrueba(page);
  });

  test("lista con menú «···», más secciones, pestañas de vista previa y diseño", async ({ page }) => {
    await abrirEditorNuevo(page);

    await page.getByRole("button", { name: /Más secciones/ }).click();
    await expect(page.getByTestId("cv-paso-extras")).toBeVisible();
    await page.getByRole("button", { name: "Proyectos", exact: true }).click();
    await expect(page.getByLabel("Nombre del proyecto")).toBeVisible();
    await page.getByLabel("Nombre del proyecto").fill("Tienda en línea");
    // Logros con formato: la barrita pone negrita y la hoja la muestra.
    const logros = page.getByLabel("Qué hiciste (uno por línea)");
    await logros.fill("Ventas");
    await logros.selectText();
    await page.getByRole("button", { name: "Negrita" }).first().click();
    // Se ve en negrita en el editor mismo, sin marcas.
    await expect(logros.locator("b, strong")).toHaveText("Ventas");
    await expect(logros).not.toContainText("**");
    // Más secciones nuevas, como en FlowCV.
    for (const nombre of ["Cursos", "Premios", "Voluntariado y organizaciones", "Publicaciones", "Intereses", "Declaración"]) {
      await expect(page.getByRole("button", { name: nombre, exact: true })).toBeVisible();
    }
    // Orden de las secciones: ocultar Proyectos lo saca de la hoja sin borrarlo.
    const orden = page.getByTestId("cv-orden-secciones");
    await expect(orden.locator('[data-seccion="proyectos"]')).toBeVisible();
    await orden.getByRole("button", { name: "Ocultar Proyectos" }).click();
    // En el teléfono la hoja va en su pestaña, como en FlowCV (19-nov-2026).
    const pestana = (nombre: string) => page.getByRole("tab", { name: nombre });
    await pestana("Vista previa").click();
    const hoja = page.getByTestId("cv-hoja");
    await expect(hoja.locator("svg").first()).toBeVisible();
    await expect(hoja.locator('[data-seccion="proyectos"]')).toHaveCount(0);
    await pestana("Editar").click();
    await orden.getByRole("button", { name: "Mostrar Proyectos" }).click();
    await pestana("Vista previa").click();
    // La hoja es la misma maqueta del PDF: la negrita va como texto en negrita.
    await expect(hoja.locator('[data-seccion="proyectos"] text[font-weight="700"]').filter({ hasText: "Ventas" })).toHaveCount(1);
    await expect(hoja.getByText("PROYECTOS", { exact: true })).toBeVisible();

    // Diseño: cambiar de plantilla cambia la hoja, no el contenido.
    await pestana("Diseño").click();
    await expect(page.getByTestId("cv-panel-diseno")).toBeVisible();
    await page.getByTestId("cv-plantilla-lateral").click();
    await expect(page.getByTestId("cv-plantilla-lateral")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/algunos filtros automáticos \(ATS\) leen mejor una sola/)).toBeVisible();
    await page.getByRole("radio", { name: "A4" }).click();
    await pestana("Vista previa").click();
    await expect(hoja.getByText("PROYECTOS", { exact: true })).toBeVisible();
    await expect(page.getByText(/^\d+ páginas?$/)).toBeVisible();

    await pestana("Editar").click();
    await page.getByRole("button", { name: /Revisar y descargar/ }).click();
    await expect(page.getByRole("radiogroup", { name: "Idioma del documento" })).toBeVisible();

    await flechaDeLaBarra(page).click();
    const fila = page.getByTestId("cv-documento").first();
    await expect(fila.getByRole("button", { name: /Editar|Duplicar|Eliminar/ })).toHaveCount(0);
    await fila.getByRole("button", { name: "Más opciones" }).click();
    for (const opcion of ["Descargar PDF", "Duplicar", "Eliminar"]) await expect(page.getByRole("menuitem", { name: opcion }).or(page.getByRole("button", { name: opcion })).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await borrarLosDeLaPrueba(page);
  });
});
