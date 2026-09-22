import { expect, test } from "playwright/test";
import { isMobileProject } from "./helpers";

// La regla: una cabecera pegada levanta sombra SOLO cuando hay algo pasando por
// debajo. La marca que la enciende vivía dentro del gancho de la franja al pie,
// así que en la mayoría del app nunca se encendía: la cabecera llevaba la clase
// y la sombra no llegaba nunca.
const PANTALLAS = ["/es/servicios", "/es/empleos", "/es/ofertas", "/es/buscar"];

test("@seeded la cabecera pegada enciende su sombra al desplazar, y no antes", async ({ page }) => {
  test.skip(isMobileProject(test.info()), "Basta comprobar la regla una vez.");
  for (const ruta of PANTALLAS) {
    await page.goto(ruta);
    await page.waitForLoadState("networkidle").catch(() => {});
    const cabecera = page.locator(".ccr-cabecera-pegada").first();
    await expect(cabecera, `${ruta} debe tener una cabecera pegada`).toBeAttached();

    // Arriba del todo no tapa nada: sin sombra.
    await expect
      .poll(async () => page.evaluate(() => getComputedStyle(document.querySelector(".ccr-cabecera-pegada") as HTMLElement).boxShadow), { timeout: 5000 })
      .toBe("none");

    await page.evaluate(() => window.scrollTo(0, 400));
    // Desplazada: sombra puesta, y la marca del cuerpo encendida.
    await expect
      .poll(async () => page.evaluate(() => getComputedStyle(document.querySelector(".ccr-cabecera-pegada") as HTMLElement).boxShadow), { timeout: 5000 })
      .toContain("8px 12px -6px");
    expect(await page.evaluate(() => document.body.hasAttribute("data-ccr-desplazado")), `${ruta}`).toBe(true);
  }
});
