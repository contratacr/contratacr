import { expect, test } from "playwright/test";
import sharp from "sharp";
import { isMobileProject } from "./helpers";

/**
 * EL BUSCADOR DE LA BARRA NO PARPADEA EN LOS TABLEROS.
 *
 * En Empleos, Promociones y Proyectos el buscador de la barra lo dibuja la
 * página y llega a la barra por un portal. Un portal no existe en el servidor,
 * así que la barra se pintaba con un hueco y el buscador aparecía ~200 ms
 * después, en cada carga. El servidor pinta ahora un GEMELO exacto
 * (`GemeloDelBuscador`) que el de verdad tapa al montarse.
 *
 * Esta prueba es la que mantiene honesto al gemelo: si alguien cambia la caja,
 * el icono, el relleno o el texto del buscador de verdad y no toca el gemelo,
 * los dos dejan de calzar y aquí se ve. Se comparan PÍXELES, no clases: una
 * `span` con `truncate` decía «busca…» donde el `input` decía «buscas?», y eso
 * no lo caza ninguna medición de cajas.
 */
const TABLEROS = ["/es/empleos", "/es/promociones", "/es/proyectos", "/en/promociones"];

test("el gemelo del buscador viene del servidor y calza al píxel", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "el buscador en la barra es de computadora");
  test.setTimeout(240_000);

  for (const ruta of TABLEROS) {
    const html = await (await page.request.get(ruta)).text();
    expect(html, `${ruta}: el gemelo tiene que venir en el HTML del servidor`).toContain("data-gemelo-buscador");

    await page.goto(ruta);
    await page.waitForTimeout(2500);

    // Montado el de verdad, el gemelo se esconde solo (regla data-ccr-gemelo).
    const visibilidad = await page.evaluate(() => getComputedStyle(document.querySelector("[data-gemelo-buscador]")!).visibility);
    expect(visibilidad, `${ruta}: con el portal montado el gemelo no debe verse`).toBe("hidden");

    const caja = await page.evaluate(() => {
      const w = document.getElementById("ccr-marketplace-navbar-slot")!.parentElement!.getBoundingClientRect();
      return { x: Math.floor(w.x), y: Math.floor(w.y), width: Math.ceil(w.width), height: Math.ceil(w.height) };
    });
    const conElDeVerdad = await page.screenshot({ clip: caja });

    await page.evaluate(() => {
      document.getElementById("ccr-marketplace-navbar-slot")!.style.display = "none";
      document.querySelector<HTMLElement>("[data-gemelo-buscador]")!.style.setProperty("visibility", "visible", "important");
    });
    await page.waitForTimeout(200);
    const soloElGemelo = await page.screenshot({ clip: caja });

    const a = await sharp(soloElGemelo).greyscale().raw().toBuffer();
    const b = await sharp(conElDeVerdad).greyscale().raw().toBuffer();
    let distintos = 0;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 24) distintos++;

    expect(distintos, `${ruta}: ${distintos} píxeles cambian cuando el buscador de verdad tapa al gemelo`).toBe(0);
  }
});
