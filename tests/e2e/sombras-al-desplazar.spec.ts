import { expect, test } from "playwright/test";

// La regla: una cabecera pegada levanta sombra SOLO cuando hay algo pasando por
// debajo. La marca que la enciende vivía dentro del gancho de la franja al pie,
// así que en la mayoría del app nunca se encendía: la cabecera llevaba la clase
// y la sombra no llegaba nunca.
// Se comprueba en computadora Y en teléfono: la cabecera que se pega no es la
// misma en los dos —en el teléfono es la de la sección, en computadora la barra
// del sitio— y el fallo era justo que en el teléfono no se encendía.
const PANTALLAS = ["/es/servicios", "/es/empleos", "/es/ofertas", "/es/buscar"];

test("@seeded la cabecera pegada enciende su sombra al desplazar, y no antes", async ({ page }) => {
  for (const ruta of PANTALLAS) {
    await page.goto(ruta);
    await page.waitForLoadState("networkidle").catch(() => {});
    const cabecera = page.locator(".ccr-cabecera-pegada").first();
    await expect(cabecera, `${ruta} debe tener una cabecera pegada`).toBeAttached();

    // Arriba del todo no tapa nada: sin sombra.
    await expect
      .poll(async () => page.evaluate(() => getComputedStyle(document.querySelector(".ccr-cabecera-pegada") as HTMLElement).boxShadow), { timeout: 5000 })
      .toBe("none");

    // Desplazar lo que de verdad se desplaza en esta pantalla: hay pantallas
    // —/buscar— donde el contenido se mueve dentro de un contenedor.
    await page.evaluate(() => {
      const doc = document.scrollingElement!;
      if (doc.scrollHeight > doc.clientHeight + 100) { window.scrollTo(0, 400); return; }
      const dentro = ([...document.querySelectorAll("*")] as HTMLElement[])
        .find((e) => e.clientHeight > 300 && e.scrollHeight > e.clientHeight + 100 && /auto|scroll/.test(getComputedStyle(e).overflowY));
      dentro?.scrollTo({ top: 400 });
    });
    // Desplazada: sombra puesta, y la marca del cuerpo encendida.
    await expect
      .poll(async () => page.evaluate(() => getComputedStyle(document.querySelector(".ccr-cabecera-pegada") as HTMLElement).boxShadow), { timeout: 5000 })
      .toContain("8px 12px -6px");
    expect(await page.evaluate(() => document.body.hasAttribute("data-ccr-desplazado")), `${ruta}`).toBe(true);
  }
});
