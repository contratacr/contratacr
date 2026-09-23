import { test, expect, type Page } from "playwright/test";
import { gotoOK, isMobileProject } from "./helpers";

// PONER UN CAMPO NO PUEDE BORRAR EL OTRO.
// La ubicación elegida se MUESTRA con la provincia detrás («Atenas, Alajuela»)
// y se guarda con su rótulo corto («Atenas»): comparados a secas no coincidían,
// así que al elegir el servicio la ubicación se daba por perdida y la búsqueda
// salía a todo el país. Y el servicio recién elegido no se veía todavía desde
// la función que arma la dirección, que entonces salía a ADIVINARLO del texto
// escrito —y podía adivinar otro—.
async function elegirServicio(page: Page, texto: string) {
  // Hay que ESPERAR a que el botón del buscador pinte. Con `isVisible()` a secas
  // se consultaba en el instante de la carga: si todavía no estaba, el ayudante
  // se saltaba el clic y después esperaba un campo que nadie había abierto —por
  // eso fallaba solo con `?provincia=sj` y no con la búsqueda que ya traía cantón.
  const abrir = page.getByRole("button", { name: /Qué servicio|What service|Atenas|Profesionales/i }).filter({ visible: true }).first();
  await expect(abrir).toBeVisible();
  const campo = page.getByRole("combobox", { name: /^Servicio$|^Service$/i }).filter({ visible: true }).first();
  // El botón se pinta desde el servidor y durante unos milisegundos todavía no
  // tiene quién le escuche el toque: ese primer clic se pierde. Se reintenta
  // hasta que el buscador abra de verdad.
  await expect(async () => {
    await abrir.click();
    await expect(campo).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15000 });
  await campo.fill(texto);
  const opcion = page.getByRole("option").filter({ visible: true }).first();
  await expect(opcion).toBeVisible();
  await opcion.click();
}

test("elegir el servicio conserva la ubicación que ya estaba", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), "El buscador en panel es el del teléfono.");
  await gotoOK(page, "/es/buscar?provincia=al&canton=al-at");
  await elegirServicio(page, "Fletes y carga");
  await expect(page).toHaveURL(/categoria=fletes/);
  await expect(page).toHaveURL(/provincia=al/);
  await expect(page).toHaveURL(/canton=al-at/);
});

test("con el servicio escrito a medias se elige el de la lista, no otro", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), "El buscador en panel es el del teléfono.");
  await gotoOK(page, "/es/buscar?provincia=sj");
  await elegirServicio(page, "Fletes");
  await expect(page).toHaveURL(/categoria=fletes(&|$)/);
  await expect(page).toHaveURL(/provincia=sj/);
});
